import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { sql, rows, one, locked, type Executor } from "./db";
import type { Identity } from "./auth";
import type { Configuration } from "./schemas";
import { requireThat } from "./errors";
import { slotWithinHours } from "./calendar";
import { sendMail } from "./company";
export async function bookingDashboard(u: Identity) {
  const [slots, bookings, emails] = await Promise.all([
    rows(
      sql`SELECT * FROM booking_slots WHERE workspace_id=${u.workspace_id} AND ends_at>now() ORDER BY starts_at`,
    ),
    rows(
      sql`SELECT * FROM demo_bookings WHERE workspace_id=${u.workspace_id} ORDER BY starts_at DESC LIMIT 200`,
    ),
    rows(
      sql`SELECT e.id,e.recipient_role,e.status,e.sent_at,a.result->'booking'->>'id' AS booking_id FROM booking_emails e JOIN action_events a ON a.id=e.action_id WHERE e.workspace_id=${u.workspace_id} ORDER BY e.created_at DESC LIMIT 400`,
    ),
  ]);
  return {
    slots,
    bookings,
    emails,
    emailConfigured: !!process.env.RESEND_API_KEY,
    ownerEmail: u.email,
  };
}
export async function editSlot(u: Identity, input: unknown) {
  const v = z
    .discriminatedUnion("operation", [
      z
        .object({
          operation: z.literal("add"),
          serviceId: z.string().min(1).max(200),
          start: z.string().datetime({ offset: true }),
        })
        .strict(),
      z
        .object({ operation: z.literal("remove"), id: z.string().uuid() })
        .strict(),
    ])
    .parse(input);
  return locked(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM workspaces WHERE id=${u.workspace_id} FOR UPDATE`,
    );
    if (v.operation === "remove") {
      const slot = await one<{ starts_at: Date; ends_at: Date }>(
        sql`SELECT * FROM booking_slots WHERE id=${v.id} AND workspace_id=${u.workspace_id}`,
        tx,
      );
      requireThat(slot, 404, "Slot not found");
      requireThat(
        !(await one(
          sql`SELECT id FROM demo_bookings WHERE workspace_id=${u.workspace_id} AND status='confirmed' AND starts_at<${slot.ends_at} AND ends_at>${slot.starts_at}`,
          tx,
        )),
        409,
        "This slot has a booking. It cannot be removed.",
      );
      await tx.execute(
        sql`DELETE FROM booking_slots WHERE id=${v.id} AND workspace_id=${u.workspace_id}`,
      );
      return { saved: true };
    }
    const config = await one<{ data: Configuration }>(
      sql`SELECT data FROM configurations WHERE workspace_id=${u.workspace_id} ORDER BY version DESC LIMIT 1`,
      tx,
    );
    const service = config?.data.services.find((s) => s.id === v.serviceId);
    requireThat(
      service && config,
      422,
      "Save your business and services first.",
    );
    requireThat(
      slotWithinHours(v.start, service.minutes, config.data),
      422,
      "Choose a future time within your opening hours and the next 90 days.",
    );
    const end = DateTime.fromISO(v.start)
      .plus({ minutes: service.minutes })
      .toISO()!;
    requireThat(
      !(await one(
        sql`SELECT id FROM booking_slots WHERE workspace_id=${u.workspace_id} AND starts_at<${end}::timestamptz AND ends_at>${v.start}::timestamptz`,
        tx,
      )),
      409,
      "This time overlaps an existing slot.",
    );
    requireThat(
      !(await one(
        sql`SELECT id FROM demo_bookings WHERE workspace_id=${u.workspace_id} AND status='confirmed' AND starts_at<${end}::timestamptz AND ends_at>${v.start}::timestamptz`,
        tx,
      )),
      409,
      "This time is already booked.",
    );
    await tx.execute(
      sql`INSERT INTO booking_slots(id,workspace_id,service_id,starts_at,ends_at) VALUES(${randomUUID()},${u.workspace_id},${v.serviceId},${v.start}::timestamptz,${end}::timestamptz)`,
    );
    return { saved: true };
  });
}
export async function publishedSlot(
  workspace: string,
  service: string,
  start: string,
  end: string,
  tx: Executor,
) {
  return !!(await one(
    sql`SELECT id FROM booking_slots WHERE workspace_id=${workspace} AND service_id=${service} AND starts_at=${start}::timestamptz AND ends_at>=${end}::timestamptz`,
    tx,
  ));
}
export async function queueBookingEmails(
  tx: Executor,
  actionId: string,
  workspace: string,
  contact: string,
  body: string,
) {
  const owner = await one<{ email: string }>(
    sql`SELECT u.email FROM users u JOIN workspaces w ON w.user_id=u.id WHERE w.id=${workspace}`,
    tx,
  );
  const recipients = [
    { role: "owner", email: owner?.email },
    { role: "caller", email: contact },
  ];
  for (const r of recipients) {
    if (!z.email().safeParse(r.email).success) continue;
    await tx.execute(
      sql`INSERT INTO booking_emails(id,action_id,workspace_id,recipient,recipient_role,subject,body) VALUES(${randomUUID()},${actionId},${workspace},${r.email!},${r.role},'Rev3 Studio booking update',${body}) ON CONFLICT DO NOTHING`,
    );
  }
}
export async function deliverBookingEmails() {
  if (!process.env.RESEND_API_KEY) return;
  // Retry only within the provider's idempotency window to avoid duplicate sends.
  for (let n = 0; n < 10; n++) {
    const job = await locked(async (tx) => {
      await tx.execute(
        sql`UPDATE booking_emails SET status='failed' WHERE status IN ('pending','sending') AND created_at<now()-interval '23 hours'`,
      );
      const row = await one<{
        id: string;
        recipient: string;
        subject: string;
        body: string;
        attempts: number;
      }>(
        sql`SELECT * FROM booking_emails WHERE (status='pending' OR status='sending') AND next_attempt_at<=now() AND attempts<4 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        tx,
      );
      if (row)
        await tx.execute(
          sql`UPDATE booking_emails SET status='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' WHERE id=${row.id}`,
        );
      return row;
    });
    if (!job) break;
    try {
      await sendMail(
        job.recipient,
        job.subject,
        job.body,
        undefined,
        `booking-${job.id}`,
      );
      await locked((tx) =>
        tx.execute(
          sql`UPDATE booking_emails SET status='sent',sent_at=now() WHERE id=${job.id}`,
        ),
      );
    } catch {
      await locked((tx) =>
        tx.execute(
          sql`UPDATE booking_emails SET status=${job.attempts >= 3 ? "failed" : "pending"} WHERE id=${job.id}`,
        ),
      );
    }
  }
}
