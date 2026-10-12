import { randomUUID } from "node:crypto";
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { sql, one, rows, locked, json, type Executor } from "./db";
import { type Identity } from "./auth";
import { settings, liveUnavailable, localRepeatTests } from "./config";
import { requireThat } from "./errors";
import { hash, newToken, rateLimit } from "./security";
import {
  configurationSchema,
  missingConfiguration,
  type Configuration,
} from "./schemas";
import { candidateSlots } from "./calendar";
import { DateTime } from "luxon";
export type Session = {
  id: string;
  workspace_id: string;
  configuration_id: string;
  snapshot: Configuration;
  email_hash: string;
  mode: "live" | "simulation";
  state: "reserved" | "active" | "completed" | "failed_before_activation";
  room: string;
  identity: string;
  worker_hash: string;
  reserved_at: Date;
  activated_at: Date | null;
  deadline: Date | null;
  disconnected_at: Date | null;
  ended_at: Date | null;
  audio_intent_at: Date | null;
  error: string | null;
};
export const roomClient = () =>
  new RoomServiceClient(
    process.env.LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  );
export async function ownedSession(id: string, u: Identity, tx?: Executor) {
  const s = await one<Session>(
    sql`SELECT * FROM voice_sessions WHERE id=${id} AND workspace_id=${u.workspace_id}`,
    tx,
  );
  requireThat(s, 404, "Session not found");
  return s;
}
export async function reserve(
  u: Identity,
  mode: "live" | "simulation",
): Promise<Session & { workerToken: string }> {
  const config = settings();
  if (mode === "live")
    requireThat(!liveUnavailable(), 503, liveUnavailable() || "Unavailable");
  else
    requireThat(
      config.mode === "simulation",
      403,
      "Simulation is disabled in live mode",
    );
  await rateLimit(`start:${u.id}`, 8, 600);
  return locked(async (tx) => {
    const c = await one<{ id: string; data: Configuration }>(
      sql`SELECT id,data FROM configurations WHERE workspace_id=${u.workspace_id} ORDER BY version DESC LIMIT 1`,
      tx,
    );
    requireThat(c, 422, "Save and review your configuration before starting.");
    const snapshot = configurationSchema.parse(c.data);
    const workspace = await one<{ voice: string }>(
      sql`SELECT voice FROM workspaces WHERE id=${u.workspace_id}`,
      tx,
    );
    snapshot.voice = workspace.voice;
    requireThat(
      missingConfiguration(snapshot).length === 0,
      422,
      `Complete: ${missingConfiguration(snapshot).join(", ")}`,
    );
    const existing = await one<Session>(
      sql`SELECT * FROM voice_sessions WHERE workspace_id=${u.workspace_id} AND state IN ('reserved','active')`,
      tx,
    );
    requireThat(
      !existing,
      409,
      "Your test is already preparing or in progress. Rejoin the existing session.",
    );
    if (mode === "live") {
      const e = await one<{ state: string }>(
        sql`SELECT state FROM entitlements WHERE email_hash=${u.email_hash}`,
        tx,
      );
      requireThat(
        e && (["available", "failed_before_activation"].includes(e.state) || (localRepeatTests() && e.state === "consumed")),
        409,
        "Your voice test has been used. Review your results and share feedback.",
      );
      const running = await one<{ count: string }>(
        sql`SELECT count(*) FROM voice_sessions WHERE mode='live' AND state IN ('reserved','active')`,
        tx,
      );
      const usage = await one<{ seconds: string; cost: string }>(
        sql`SELECT coalesce(sum(CASE WHEN settled THEN actual_seconds ELSE reserved_seconds END),0) AS seconds,coalesce(sum(estimated_gbp),0) AS cost FROM usage_ledger WHERE month=${new Date().toISOString().slice(0, 7)}`,
        tx,
      );
      const reservedSeconds = config.timeout + config.reservationTimeout;
      requireThat(
        Number(running.count) < config.concurrency &&
          Number(usage.seconds) + reservedSeconds <= config.minutes * 60 &&
          Number(usage.cost) + (reservedSeconds / 60) * config.cost <=
            config.budget,
        503,
        "Live co-creation testing is currently at capacity. You can still review your setup and share feedback.",
      );
    }
    const id = randomUUID(),
      workerToken = newToken();
    if (
      snapshot.fictional &&
      snapshot.tasks.includes("Demo appointments") &&
      !(await one(
        sql`SELECT id FROM demo_resources WHERE workspace_id=${u.workspace_id} AND ends_at>now()`,
        tx,
      ))
    ) {
      for (let day = 1; day <= 7; day++) {
        const slots = candidateSlots(
          DateTime.now()
            .setZone(snapshot.timezone)
            .plus({ days: day })
            .toISODate()!,
          snapshot.services[0].minutes,
          snapshot,
        );
        if (slots.length) {
          const start = slots[0],
            end = DateTime.fromISO(start)
              .plus({ minutes: snapshot.services[0].minutes })
              .toISO()!;
          await tx.execute(
            sql`INSERT INTO demo_resources(id,workspace_id,label,starts_at,ends_at) VALUES(${randomUUID()},${u.workspace_id},'Fictional occupied demo slot',${start}::timestamptz,${end}::timestamptz)`,
          );
          break;
        }
      }
    }
    const s = await one<Session>(
      sql`INSERT INTO voice_sessions(id,workspace_id,configuration_id,snapshot,email_hash,mode,state,room,identity,worker_hash)
      VALUES(${id},${u.workspace_id},${c.id},${json(snapshot)},${u.email_hash},${mode},'reserved',${"rev3-" + id},${"participant-" + randomUUID()},${hash(workerToken)}) RETURNING *`,
      tx,
    );
    if (mode === "live") {
      await tx.execute(
        sql`UPDATE entitlements SET state='reserved',session_id=${id},updated_at=now() WHERE email_hash=${u.email_hash}`,
      );
      const seconds = config.timeout + config.reservationTimeout;
      await tx.execute(
        sql`INSERT INTO usage_ledger(session_id,month,reserved_seconds,estimated_gbp) VALUES(${id},${new Date().toISOString().slice(0, 7)},${seconds},${(seconds / 60) * config.cost})`,
      );
    }
    return { ...s, workerToken };
  });
}
export async function tokenFor(s: Session) {
  requireThat(
    ["reserved", "active"].includes(s.state),
    409,
    "This test has ended.",
  );
  const hardEnd = s.deadline
    ? new Date(s.deadline).getTime()
    : new Date(s.reserved_at).getTime() + settings().reservationTimeout * 1000;
  requireThat(Date.now() < hardEnd, 409, "This test has ended.");
  if (s.disconnected_at)
    requireThat(
      Date.now() - new Date(s.disconnected_at).getTime() <=
        settings().grace * 1000,
      409,
      "The reconnection window has closed.",
    );
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: s.identity,
      ttl: Math.max(1, Math.min(60, Math.ceil((hardEnd - Date.now()) / 1000))),
    },
  );
  token.addGrant({
    room: s.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return {
    id: s.id,
    url: process.env.LIVEKIT_URL,
    token: await token.toJwt(),
    deadline: s.deadline,
    state: s.state,
  };
}
export async function start(u: Identity) {
  const s = await reserve(u, "live");
  try {
    await roomClient().createRoom({
      name: s.room,
      emptyTimeout: 60,
      departureTimeout: 30,
      maxParticipants: 2,
    });
    await new AgentDispatchClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    ).createDispatch(s.room, "rev3-reception", {
      metadata: JSON.stringify({ sessionId: s.id, workerToken: s.workerToken }),
    });
    return await tokenFor(s);
  } catch {
    await terminate(
      s,
      "Voice connection could not start. Your allowance has not been used.",
    );
    throw new Error(
      "Live voice connection could not start. Please try again later.",
    );
  }
}
export async function activate(id: string, tx: Executor) {
  const s = await one<Session>(
    sql`SELECT * FROM voice_sessions WHERE id=${id}`,
    tx,
  );
  requireThat(s, 404, "Session not found");
  if (s.state === "active") return s;
  requireThat(
    s.state === "reserved" &&
      Date.now() - new Date(s.reserved_at).getTime() <
        settings().reservationTimeout * 1000,
    409,
    "Reservation expired",
  );
  const result = await one<Session>(
    sql`UPDATE voice_sessions SET state='active',activated_at=now(),deadline=now()+${settings().timeout}*interval '1 second',worker_seen_at=now() WHERE id=${id} RETURNING *`,
    tx,
  );
  if (s.mode === "live")
    await tx.execute(
      sql`UPDATE entitlements SET state='active',updated_at=now() WHERE email_hash=${s.email_hash} AND session_id=${id}`,
    );
  return result;
}
export async function finish(
  id: string,
  error: string | null,
  tx: Executor,
  workerAudioObserved?: boolean,
) {
  const s = await one<Session>(
    sql`SELECT * FROM voice_sessions WHERE id=${id}`,
    tx,
  );
  if (!s || !["reserved", "active"].includes(s.state)) return;
  if (
    s.mode === "live" &&
    !s.activated_at &&
    s.audio_intent_at &&
    workerAudioObserved === undefined
  ) {
    // A process may die after sending audio but before recording activation. Absence
    // of a room cannot prove that audio never played. Hold entitlement for an audit.
    await tx.execute(
      sql`UPDATE voice_sessions SET error='Activation outcome is uncertain. Owner verification is required before retrying.' WHERE id=${id}`,
    );
    return;
  }
  const consumed = !!s.activated_at || workerAudioObserved === true;
  await tx.execute(
    sql`UPDATE voice_sessions SET state=${consumed ? "completed" : "failed_before_activation"},ended_at=now(),error=${error} WHERE id=${id}`,
  );
  if (s.mode === "live") {
    await tx.execute(
      sql`UPDATE entitlements SET state=${consumed ? "consumed" : "failed_before_activation"},updated_at=now() WHERE email_hash=${s.email_hash} AND session_id=${s.id}`,
    );
    // Charge the entire reserved interval conservatively, including provider preparation.
    // Provider billing is delayed; this estimate never promises an exact financial cap.
    await tx.execute(
      sql`UPDATE usage_ledger SET actual_seconds=reserved_seconds,settled=true WHERE session_id=${id}`,
    );
  }
}
export async function terminate(s: Session, error: string | null = null) {
  if (s.mode === "live") {
    try {
      await roomClient().deleteRoom(s.room);
    } catch (error) {
      // Only release a reservation when absence is confirmed. Network errors keep it reserved.
      const rooms = await roomClient().listRooms([s.room]);
      if (rooms.length) throw error;
    }
  }
  await locked((tx) => finish(s.id, error, tx));
}
export async function reconcileSessions() {
  const pending =
    await rows<Session>(sql`SELECT * FROM voice_sessions WHERE state IN ('reserved','active') AND
    ((state='reserved' AND error IS DISTINCT FROM 'Activation outcome is uncertain. Owner verification is required before retrying.' AND reserved_at<now()-${settings().reservationTimeout}*interval '1 second') OR
     (state='active' AND (deadline<now() OR disconnected_at<now()-${settings().grace}*interval '1 second')))`);
  for (const s of pending)
    await terminate(
      s,
      s.state === "reserved"
        ? "The test did not activate. Your allowance is safe."
        : null,
    );
  return pending.length;
}
