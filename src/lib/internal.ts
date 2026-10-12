import { z } from "zod";
import { sql, one, locked, json } from "./db";
import { hash, safeEqual, verifyService } from "./security";
import { requireThat } from "./errors";
import { activate, finish, roomClient, type Session } from "./sessions";
import { executeAction } from "./actions";
const envelope = z
  .object({
    sessionId: z.string().uuid(),
    workerToken: z.string().min(32).max(100),
    kind: z.enum([
      "claim",
      "heartbeat",
      "audio_intent",
      "activate",
      "transcript",
      "disconnected",
      "connected",
      "finish",
      "action",
    ]),
    id: z.string().min(1).max(120),
    data: z.unknown().optional(),
  })
  .strict();
export async function workerRequest(request: Request, raw: string) {
  const nonce = verifyService(request, raw),
    body = envelope.parse(JSON.parse(raw));
  const s = await one<Session>(
    sql`SELECT * FROM voice_sessions WHERE id=${body.sessionId}`,
  );
  requireThat(
    s && s.mode === "live" && safeEqual(s.worker_hash, hash(body.workerToken)),
    401,
    "Session authentication failed",
  );
  await locked(async (tx) => {
    requireThat(
      !(await one(
        sql`SELECT id FROM worker_events WHERE id=${"nonce:" + nonce}`,
        tx,
      )),
      409,
      "Replayed service request",
    );
    await tx.execute(
      sql`INSERT INTO worker_events(id,session_id,kind) VALUES(${"nonce:" + nonce},${s.id},'nonce')`,
    );
  });
  if (body.kind === "claim") {
    await locked(async (tx) => {
      const claimed = await one(
        sql`UPDATE voice_sessions SET worker_claim_id=${body.id},worker_seen_at=now() WHERE id=${s.id} AND state='reserved' AND (worker_claim_id IS NULL OR worker_claim_id=${body.id}) RETURNING id`,
        tx,
      );
      requireThat(claimed, 409, "Session already claimed, started or ended");
    });
    return {
      configuration: s.snapshot,
      room: s.room,
      identity: s.identity,
      reservedAt: s.reserved_at,
    };
  }
  if (body.kind === "action") return executeAction(s.id, body.data);
  if (body.kind === "activate") {
    // Signed worker emits this only after positive playback_progressed from LiveKit's sink.
    const data = z
      .object({ agentIdentity: z.string().min(1) })
      .strict()
      .parse(body.data);
    const participants = await roomClient().listParticipants(s.room);
    requireThat(
      participants.some((p) => p.identity === s.identity) &&
        participants.some(
          (p) =>
            p.identity === data.agentIdentity &&
            p.tracks.some((t) => t.type === 0),
        ),
      409,
      "Authorised caller and published agent audio are required",
    );
  }
  return locked(async (tx) => {
    const key = `${s.id}:${body.id}`;
    const current = await one<Session>(
      sql`SELECT * FROM voice_sessions WHERE id=${s.id}`,
      tx,
    );
    if (await one(sql`SELECT id FROM worker_events WHERE id=${key}`, tx))
      return { state: current.state, deadline: current.deadline };
    const finalTranscript =
      body.kind === "transcript" &&
      current.ended_at &&
      Date.now() - new Date(current.ended_at).getTime() < 60000;
    requireThat(
      ["reserved", "active"].includes(current.state) ||
        body.kind === "finish" ||
        finalTranscript,
      409,
      "Session ended",
    );
    let output: unknown = { state: current.state, deadline: current.deadline };
    if (body.kind === "activate") {
      const a = await activate(s.id, tx);
      output = { state: a.state, deadline: a.deadline };
    }
    if (body.kind === "audio_intent")
      await tx.execute(
        sql`UPDATE voice_sessions SET audio_intent_at=coalesce(audio_intent_at,now()) WHERE id=${s.id}`,
      );
    if (body.kind === "transcript") {
      const turn = z
        .object({
          id: z.string().min(1).max(120),
          role: z.enum(["user", "assistant"]),
          text: z.string().max(6000),
          sentiment: z.object({model: z.literal("vader-3.3.2"), compound: z.number().min(-1).max(1), label: z.enum(["positive","neutral","negative"])}).strict().nullable().optional(),
        })
        .strict()
        .parse(body.data);
      await tx.execute(
        sql`INSERT INTO transcript_turns(id,session_id,role,text,sentiment) VALUES(${turn.id},${s.id},${turn.role},${turn.text},${json(turn.role === "user" ? turn.sentiment || null : null)}) ON CONFLICT DO NOTHING`,
      );
    }
    if (body.kind === "heartbeat")
      await tx.execute(
        sql`UPDATE voice_sessions SET worker_seen_at=now() WHERE id=${s.id}`,
      );
    if (body.kind === "disconnected" || body.kind === "connected") {
      const data = z
        .object({ observedAt: z.string().datetime() })
        .strict()
        .parse(body.data);
      requireThat(
        Math.abs(Date.now() - new Date(data.observedAt).getTime()) < 60000,
        422,
        "Connection event timestamp invalid",
      );
      if (body.kind === "connected")
        requireThat(
          !current.disconnected_at ||
            Date.now() - new Date(current.disconnected_at).getTime() <= 30000,
          409,
          "Rejoin window expired",
        );
      await tx.execute(
        sql`UPDATE voice_sessions SET disconnected_at=${body.kind === "disconnected" ? data.observedAt : null}::timestamptz,connection_event_at=${data.observedAt}::timestamptz WHERE id=${s.id} AND (connection_event_at IS NULL OR connection_event_at<${data.observedAt}::timestamptz)`,
      );
    }
    if (body.kind === "finish") {
      const data = z
        .object({
          error: z.string().max(300).nullable(),
          audioObserved: z.boolean(),
        })
        .strict()
        .parse(body.data);
      await finish(s.id, data.error, tx, data.audioObserved);
    }
    await tx.execute(
      sql`INSERT INTO worker_events(id,session_id,kind) VALUES(${key},${s.id},${body.kind})`,
    );
    return output;
  });
}
