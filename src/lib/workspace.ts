import { randomUUID } from "node:crypto";
import { sql, one, rows, locked, json } from "./db";
import { type Identity, supabase } from "./auth";
import {
  configurationSchema,
  feedbackSchema,
  pilotSchema,
  connectionsSchema,
  type Configuration,
} from "./schemas";
import { requireThat } from "./errors";
import { ownedSession, terminate, type Session } from "./sessions";
import { settings } from "./config";
export async function saveConfiguration(u: Identity, input: unknown) {
  const data = configurationSchema.parse(input);
  return locked(async (tx) => {
    requireThat(
      !(await one(
        sql`SELECT id FROM voice_sessions WHERE workspace_id=${u.workspace_id} AND state IN ('reserved','active')`,
        tx,
      )),
      409,
      "Finish your current test before changing setup.",
    );
    const n = await one<{ version: number }>(
      sql`SELECT coalesce(max(version),0)+1 AS version FROM configurations WHERE workspace_id=${u.workspace_id}`,
      tx,
    );
    const record = await one(
      sql`INSERT INTO configurations(id,workspace_id,version,data) VALUES(${randomUUID()},${u.workspace_id},${n.version},${json(data)}) RETURNING id,version,data`,
      tx,
    );
    await tx.execute(
      sql`UPDATE workspaces SET voice=${data.voice} WHERE id=${u.workspace_id}`,
    );
    return record;
  });
}
export async function saveFeedback(u: Identity, input: unknown) {
  const data = feedbackSchema.parse(input);
  return locked(async (tx) => {
    const session = data.sessionId
      ? await ownedSession(data.sessionId, u, tx)
      : null;
    if (data.turnId)
      requireThat(
        session &&
          (await one(
            sql`SELECT id FROM transcript_turns WHERE session_id=${session.id} AND id=${data.turnId}`,
            tx,
          )),
        422,
        "Transcript turn not found",
      );
    if (data.actionId)
      requireThat(
        session &&
          (await one(
            sql`SELECT id FROM action_events WHERE session_id=${session.id} AND id=${data.actionId}`,
            tx,
          )),
        422,
        "Action not found",
      );
    const c = await one<{ version: number; data: Configuration }>(
      session
        ? sql`SELECT version,data FROM configurations WHERE id=${session.configuration_id} AND workspace_id=${u.workspace_id}`
        : sql`SELECT version,data FROM configurations WHERE workspace_id=${u.workspace_id} ORDER BY version DESC LIMIT 1`,
      tx,
    );
    const config = session?.snapshot || c?.data;
    if (data.id) {
      const previous = await one<{ session_id: string | null }>(
        sql`SELECT session_id FROM feedback WHERE id=${data.id} AND workspace_id=${u.workspace_id}`,
        tx,
      );
      requireThat(previous, 404, "Feedback not found");
      requireThat(
        (previous.session_id || undefined) === data.sessionId,
        422,
        "Feedback cannot be moved between sessions",
      );
      await tx.execute(
        sql`UPDATE feedback SET data=${json(data)},updated_at=now() WHERE id=${data.id} AND workspace_id=${u.workspace_id}`,
      );
      return { id: data.id };
    }
    const id = randomUUID();
    await tx.execute(
      sql`INSERT INTO feedback(id,workspace_id,session_id,configuration_version,voice,category,problems,data) VALUES(${id},${u.workspace_id},${session?.id || null},${c?.version || null},${config?.voice || ""},${config?.category || ""},${json(config?.problems || [])},${json(data)})`,
    );
    return { id };
  });
}
export async function saveConnections(u: Identity, input: unknown) {
  const data = connectionsSchema.parse(input);
  await locked((tx) =>
    tx.execute(
      sql`INSERT INTO connections(workspace_id,data) VALUES(${u.workspace_id},${json(data)}) ON CONFLICT(workspace_id) DO UPDATE SET data=excluded.data,updated_at=now()`,
    ),
  );
  return { status: "Requested for a potential pilot" };
}
export async function savePilot(u: Identity, input: unknown) {
  const data = pilotSchema.parse(input),
    id = randomUUID();
  await locked((tx) =>
    tx.execute(
      sql`INSERT INTO pilot_requests(id,workspace_id,email,data) VALUES(${id},${u.workspace_id},${u.email},${json(data)})`,
    ),
  );
  return { id };
}
export async function deleteData(u: Identity, account: boolean) {
  const pending = await rows<Session>(
    sql`SELECT * FROM voice_sessions WHERE workspace_id=${u.workspace_id} AND state IN ('reserved','active')`,
  );
  for (const s of pending) await terminate(s);
  requireThat(
    !(await one(
      sql`SELECT id FROM voice_sessions WHERE workspace_id=${u.workspace_id} AND state IN ('reserved','active')`,
    )),
    409,
    "A test outcome needs owner verification before deletion. Your data can be deleted after the entitlement is resolved.",
  );
  // Delete external authentication first; if unavailable preserve local account so the user can retry.
  if (account && !u.provider_id.startsWith("development-") && !u.provider_id.startsWith("invitation-")) {
    const { error } = await supabase(true).auth.admin.deleteUser(u.provider_id);
    requireThat(
      !error,
      503,
      "Account deletion could not complete. Please try again later.",
    );
  }
  await locked(async (tx) => {
    if (account) await tx.execute(sql`DELETE FROM users WHERE id=${u.id}`);
    else {
      await tx.execute(
        sql`DELETE FROM feedback WHERE workspace_id=${u.workspace_id}`,
      );
      await tx.execute(
        sql`DELETE FROM voice_sessions WHERE workspace_id=${u.workspace_id}`,
      );
      await tx.execute(
        sql`DELETE FROM configurations WHERE workspace_id=${u.workspace_id}`,
      );
      await tx.execute(
        sql`DELETE FROM connections WHERE workspace_id=${u.workspace_id}`,
      );
      await tx.execute(
        sql`DELETE FROM pilot_requests WHERE workspace_id=${u.workspace_id}`,
      );
      await tx.execute(
        sql`DELETE FROM demo_resources WHERE workspace_id=${u.workspace_id}`,
      );
    }
  });
  return { deleted: true, entitlementRetained: true };
}
export async function cleanup() {
  return locked(async (tx) => {
    const cutoff = new Date(
      Date.now() - settings().retention * 86400000,
    ).toISOString();
    await tx.execute(
      sql`DELETE FROM voice_sessions WHERE state NOT IN ('reserved','active') AND reserved_at<${cutoff}::timestamptz`,
    );
    await tx.execute(
      sql`DELETE FROM feedback WHERE updated_at<${cutoff}::timestamptz`,
    );
    await tx.execute(
      sql`DELETE FROM pilot_requests WHERE created_at<${cutoff}::timestamptz`,
    );
    await tx.execute(
      sql`DELETE FROM connections WHERE updated_at<${cutoff}::timestamptz`,
    );
    await tx.execute(
      sql`DELETE FROM configurations c WHERE created_at<${cutoff}::timestamptz AND NOT EXISTS(SELECT 1 FROM voice_sessions s WHERE s.configuration_id=c.id)`,
    );
    await tx.execute(sql`DELETE FROM company_enquiries WHERE created_at<now()-interval '90 days'`);
    await tx.execute(sql`DELETE FROM studio_invitations WHERE expires_at<now()-interval '30 days'`);
    await tx.execute(sql`DELETE FROM auth_sessions WHERE expires_at<now()`);
    await tx.execute(sql`DELETE FROM rate_limits WHERE expires_at<now()`);
    await tx.execute(
      sql`DELETE FROM demo_resources WHERE ends_at<${cutoff}::timestamptz`,
    );
  });
}
