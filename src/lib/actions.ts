import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { sql, one, rows, locked, json, type Executor } from "./db";
import { toolSchema, type Configuration } from "./schemas";
import { type Session } from "./sessions";
import { AppError, requireThat } from "./errors";
import { hash } from "./security";
import { candidateSlots, slotWithinHours } from "./calendar";
type Booking = {
  id: string;
  workspace_id: string;
  service_id: string;
  service_name: string;
  customer: string;
  contact: string;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  status: string;
  reference: string;
};
type Result = Record<string, unknown>;
const taskFor = (name: string) =>
  name.includes("booking") ||
  name.includes("availability") ||
  name === "list_services"
    ? "Demo appointments"
    : name === "capture_enquiry"
      ? "Capture enquiries"
      : name === "request_callback"
        ? "Record callback requests"
        : "Flag for staff";
async function conflict(
  workspace: string,
  start: string,
  end: string,
  tx: Executor,
  except = "",
) {
  return !!(await one(
    sql`SELECT id FROM demo_bookings WHERE workspace_id=${workspace} AND status='confirmed' AND starts_at<${end}::timestamptz AND ends_at>${start}::timestamptz AND id::text<>${except}
    UNION ALL SELECT id FROM demo_resources WHERE workspace_id=${workspace} AND starts_at<${end}::timestamptz AND ends_at>${start}::timestamptz LIMIT 1`,
    tx,
  ));
}
export async function executeAction(
  sessionId: string,
  input: unknown,
): Promise<Result & { status: string }> {
  const tool = toolSchema.parse(input),
    digest = hash(JSON.stringify(tool));
  return locked(async (tx) => {
    const s = await one<Session>(
      sql`SELECT * FROM voice_sessions WHERE id=${sessionId}`,
      tx,
    );
    requireThat(s, 404, "Session not found");
    const previous = await one<{
      request_hash: string;
      result: Result;
      status: string;
    }>(
      sql`SELECT request_hash,result,status FROM action_events WHERE session_id=${s.id} AND idempotency_key=${tool.key}`,
      tx,
    );
    if (previous) {
      requireThat(
        previous.request_hash === digest,
        409,
        "Idempotency key reused for a different action",
      );
      return { status: previous.status, ...previous.result };
    }
    requireThat(
      s.state === "active" &&
        s.deadline &&
        new Date(s.deadline).getTime() > Date.now(),
      409,
      "Session is not active",
    );
    await tx.execute(
      sql`SELECT id FROM workspaces WHERE id=${s.workspace_id} FOR UPDATE`,
    );
    let result: Result,
      status: "success" | "error" = "success";
    try {
      requireThat(
        (s.snapshot.tasks as string[]).includes(taskFor(tool.name)),
        403,
        "This task is not enabled in the reviewed configuration.",
      );
      result = await runTool(s, tool, tx);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      status = "error";
      result = { message: error.message };
    }
    const actionId = randomUUID();
    await tx.execute(
      sql`INSERT INTO action_events(id,workspace_id,session_id,idempotency_key,request_hash,name,status,result) VALUES(${actionId},${s.workspace_id},${s.id},${tool.key},${digest},${tool.name},${status},${json(result)})`,
    );
    if (result.confirmation && status === "success")
      for (const channel of ["email", "sms"])
        await tx.execute(
          sql`INSERT INTO confirmation_previews(id,action_id,channel,body) VALUES(${randomUUID()},${actionId},${channel},${String(result.confirmation)})`,
        );
    return { status, ...result };
  });
}
async function runTool(
  s: Session,
  tool: ReturnType<typeof toolSchema.parse>,
  tx: Executor,
): Promise<Result> {
  const a = tool.args,
    c: Configuration = s.snapshot;
  if (tool.name === "list_services") return { services: c.services };
  if (tool.name === "check_demo_availability") {
    const service = c.services.find((v) => v.id === a.serviceId);
    requireThat(service && a.date, 422, "Specify a known service and date");
    const slots = [];
    for (const start of candidateSlots(a.date, service.minutes, c)) {
      const end = DateTime.fromISO(start)
        .plus({ minutes: service.minutes })
        .toISO()!;
      if (!(await conflict(s.workspace_id, start, end, tx))) slots.push(start);
    }
    return {
      slots,
      timezone: c.timezone,
      label: "Demo calendar",
      occupiedSlotsAreDemo: true,
    };
  }
  if (
    ["capture_enquiry", "request_callback", "flag_for_staff"].includes(
      tool.name,
    )
  ) {
    requireThat(
      a.customer && a.details,
      422,
      "Ask for a name and the request details",
    );
    if (tool.name === "request_callback")
      requireThat(a.contact, 422, "Ask for a callback contact");
    const kind =
      tool.name === "capture_enquiry"
        ? "enquiry"
        : tool.name === "request_callback"
          ? "callback"
          : "staff_follow_up";
    const id = randomUUID();
    await tx.execute(
      sql`INSERT INTO customer_records(id,workspace_id,session_id,kind,customer,contact,details) VALUES(${id},${s.workspace_id},${s.id},${kind},${a.customer},${a.contact || ""},${a.details})`,
    );
    return {
      id,
      kind,
      customer: a.customer,
      contact: a.contact || "",
      details: a.details,
      message:
        kind === "staff_follow_up"
          ? "Staff follow-up flagged : demo only."
          : kind === "callback"
            ? "Demo callback request recorded"
            : "Demo enquiry recorded",
    };
  }
  if (tool.name === "find_demo_booking") {
    requireThat(
      a.reference && a.contact,
      422,
      "Ask for the booking reference and contact details",
    );
    const booking = await one<Booking>(
      sql`SELECT * FROM demo_bookings WHERE workspace_id=${s.workspace_id} AND reference=${a.reference} AND contact=${a.contact}`,
      tx,
    );
    return {
      booking: booking || null,
      message: booking ? "Demo booking found" : "No matching demo booking",
    };
  }
  if (
    tool.name === "cancel_demo_booking" ||
    tool.name === "reschedule_demo_booking"
  ) {
    requireThat(
      a.reference && a.contact,
      422,
      "Ask for the booking reference and contact details",
    );
    const b = await one<Booking>(
      sql`SELECT * FROM demo_bookings WHERE workspace_id=${s.workspace_id} AND reference=${a.reference} AND contact=${a.contact}`,
      tx,
    );
    requireThat(
      b && b.status === "confirmed",
      404,
      "No matching confirmed demo booking",
    );
    if (tool.name === "cancel_demo_booking") {
      await tx.execute(
        sql`UPDATE demo_bookings SET status='cancelled' WHERE id=${b.id}`,
      );
      return {
        booking: { ...b, status: "cancelled" },
        message: "Demo booking cancelled",
        confirmation: "Your demo appointment has been cancelled.",
      };
    }
    const service = c.services.find((v) => v.id === b.service_id);
    requireThat(
      service && a.start && slotWithinHours(a.start, service.minutes, c),
      422,
      "Choose a future time within the supplied opening hours",
    );
    const end = DateTime.fromISO(a.start)
      .plus({ minutes: service.minutes })
      .toISO()!;
    requireThat(
      !(await conflict(s.workspace_id, a.start, end, tx, b.id)),
      409,
      "That demo slot is no longer available. The original booking is unchanged.",
    );
    const booking = await one<Booking>(
      sql`UPDATE demo_bookings SET starts_at=${a.start}::timestamptz,ends_at=${end}::timestamptz WHERE id=${b.id} RETURNING *`,
      tx,
    );
    return {
      booking,
      message: "Demo booking rescheduled",
      confirmation: `Your appointment is booked for ${DateTime.fromISO(a.start).setZone(c.timezone).toFormat("dd LLL yyyy HH:mm")} (${c.timezone}). Demo only. Reference ${b.reference}.`,
    };
  }
  requireThat(tool.name === "create_demo_booking", 422, "Unknown action");
  const service = c.services.find((v) => v.id === a.serviceId);
  requireThat(
    service && a.customer && a.contact && a.start,
    422,
    "Ask for service, customer name, contact details and an explicit date/time",
  );
  const end = DateTime.fromISO(a.start)
    .plus({ minutes: service.minutes })
    .toISO()!;
  const available =
    slotWithinHours(a.start, service.minutes, c) &&
    !(await conflict(s.workspace_id, a.start, end, tx));
  if (!available) {
    const id = randomUUID();
    await tx.execute(
      sql`INSERT INTO customer_records(id,workspace_id,session_id,kind,customer,contact,details) VALUES(${id},${s.workspace_id},${s.id},'appointment_request',${a.customer},${a.contact},${`${service.name} requested at ${a.start} (${c.timezone}); no slot confirmed.`})`,
    );
    return {
      id,
      message: "Appointment request recorded",
      confirmed: false,
      confirmation:
        "We have received your appointment request. No appointment has been confirmed. Demo only.",
    };
  }
  const reference = "R3-" + randomUUID().slice(0, 8).toUpperCase();
  const booking = await one<Booking>(
    sql`INSERT INTO demo_bookings(id,workspace_id,session_id,service_id,service_name,customer,contact,starts_at,ends_at,timezone,status,reference) VALUES(${randomUUID()},${s.workspace_id},${s.id},${service.id},${service.name},${a.customer},${a.contact},${a.start}::timestamptz,${end}::timestamptz,${c.timezone},'confirmed',${reference}) RETURNING *`,
    tx,
  );
  return {
    booking,
    confirmed: true,
    message: "Demo booking confirmed",
    confirmation: `Your appointment is booked for ${DateTime.fromISO(a.start).setZone(c.timezone).toFormat("dd LLL yyyy HH:mm")} (${c.timezone}). Demo only. Reference ${reference}.`,
  };
}
export async function results(workspaceId: string) {
  const sessionsPromise = rows<Session>(
    sql`SELECT * FROM voice_sessions WHERE workspace_id=${workspaceId} ORDER BY reserved_at DESC`,
  );
  const pending = {
    sessions: sessionsPromise.then((sessions) =>
      sessions.map((s) => ({
        id: s.id,
        state: s.state,
        mode: s.mode,
        snapshot: s.snapshot,
        activated_at: s.activated_at,
        deadline: s.deadline,
        ended_at: s.ended_at,
        error: s.error,
      })),
    ),
    turns: rows(
      sql`SELECT t.* FROM transcript_turns t JOIN voice_sessions s ON s.id=t.session_id WHERE s.workspace_id=${workspaceId} ORDER BY t.created_at,t.id`,
    ),
    actions: rows(
      sql`SELECT * FROM action_events WHERE workspace_id=${workspaceId} ORDER BY created_at`,
    ),
    bookings: rows(
      sql`SELECT * FROM demo_bookings WHERE workspace_id=${workspaceId} ORDER BY created_at DESC`,
    ),
    records: rows(
      sql`SELECT * FROM customer_records WHERE workspace_id=${workspaceId} ORDER BY created_at`,
    ),
    previews: rows(
      sql`SELECT p.* FROM confirmation_previews p JOIN action_events a ON a.id=p.action_id WHERE a.workspace_id=${workspaceId}`,
    ),
    resources: rows(
      sql`SELECT label,starts_at,ends_at FROM demo_resources WHERE workspace_id=${workspaceId} ORDER BY starts_at`,
    ),
  };
  const [sessions, turns, actions, bookings, records, previews, resources] =
    await Promise.all([
      pending.sessions,
      pending.turns,
      pending.actions,
      pending.bookings,
      pending.records,
      pending.previews,
      pending.resources,
    ]);
  return { sessions, turns, actions, bookings, records, previews, resources };
}
