import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql, one, rows, locked } from "./db";
import { hash, newToken, rateLimit } from "./security";
import { requireThat } from "./errors";
import { establish, type Identity } from "./auth";
export const enquirySchema = z
  .object({
    kind: z.enum(["studio", "service", "contact"]),
    name: z.string().trim().min(1).max(100),
    business: z.string().trim().min(1).max(160),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    category: z.string().trim().min(1).max(100),
    enquiry: z.string().trim().min(1).max(2000),
    website: z.string().max(500).optional(),
  })
  .strict();
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  replyTo?: string,
  idempotencyKey?: string,
) {
  requireThat(
    process.env.RESEND_API_KEY,
    503,
    "Email delivery is not configured yet.",
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "Rev3 <info@rev3.uk>",
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  requireThat(
    response.ok,
    503,
    "Email could not be sent. Please try again later.",
  );
}
export async function receiveEnquiry(input: unknown) {
  const data = enquirySchema.parse(input);
  if (data.website) return { received: true };
  await rateLimit("company-enquiries", 200, 3600);
  await rateLimit(`company-enquiry:${hash(data.email)}`, 3, 3600);
  const id = randomUUID();
  await (
    await import("./db")
  )
    .database()
    .then((db) =>
      db.execute(
        sql`INSERT INTO company_enquiries(id,kind,name,business,email,category,enquiry) VALUES(${id},${data.kind},${data.name},${data.business},${data.email},${data.category},${data.enquiry})`,
      ),
    );
  try {
    await sendMail(
      process.env.ENQUIRY_TO_EMAIL || "info@rev3.uk",
      `Rev3 ${data.kind === "studio" ? "Studio application" : "enquiry"}: ${data.business}`,
      `Type: ${data.kind}\nName: ${data.name}\nBusiness: ${data.business}\nEmail: ${data.email}\nCategory: ${data.category}\n\n${data.enquiry}`,
      data.email,
      `enquiry-${id}`,
    );
    await (
      await import("./db")
    )
      .database()
      .then((db) =>
        db.execute(
          sql`UPDATE company_enquiries SET mail_status='sent' WHERE id=${id}`,
        ),
      );
  } catch {
    await (
      await import("./db")
    )
      .database()
      .then((db) =>
        db.execute(
          sql`UPDATE company_enquiries SET mail_status='failed' WHERE id=${id}`,
        ),
      );
  }
  return { received: true };
}
export async function companyLeads(u: Identity) {
  requireThat(u.admin, 403, "Owner access required");
  return rows(
    sql`SELECT * FROM company_enquiries ORDER BY created_at DESC LIMIT 200`,
  );
}
export async function issueInvitation(u: Identity, emailInput: unknown) {
  requireThat(u.admin, 403, "Owner access required");
  const email = z.email().max(254).parse(emailInput).toLowerCase();
  await rateLimit(`issue-invite:${u.id}`, 20, 3600);
  const id = randomUUID(),
    code = newToken();
  await locked((tx) =>
    tx.execute(
      sql`INSERT INTO studio_invitations(id,email,token_hash,created_by,expires_at) VALUES(${id},${email},${hash(code)},${u.id},now())`,
    ),
  );
  await sendMail(
    email,
    "Your Rev3 Studio invitation",
    `You’re invited to Rev3 Studio, our co-creation programme.\n\nOpen ${process.env.STUDIO_ORIGIN || "https://voice.rev3.uk"}/access and enter this access code:\n\n${code}\n\nThis code is for you, works once and expires in 7 days. Once inside, you can use email sign-in to return.\n\nThe Rev3 team`,
    undefined,
    `invite-${id}`,
  );
  await locked((tx) =>
    tx.execute(
      sql`UPDATE studio_invitations SET expires_at=now()+interval '7 days' WHERE id=${id}`,
    ),
  );
  return { sent: true };
}
export async function redeemInvitation(input: unknown) {
  await rateLimit("studio-code-attempts", 1000, 3600);
  const code = z.string().trim().min(30).max(100).parse(input);
  const email = await locked(async (tx) => {
    const invitation = await one<{
      id: string;
      email: string;
      created_by: string;
    }>(
      sql`UPDATE studio_invitations SET redeemed_at=now() WHERE token_hash=${hash(code)} AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING id,email,created_by`,
      tx,
    );
    requireThat(
      invitation,
      401,
      "That access code is invalid, expired or already used. You can sign in by email if you have already joined.",
    );
    await tx.execute(
      sql`INSERT INTO studio_members(email,approved_by) VALUES(${invitation.email},${invitation.created_by}) ON CONFLICT DO NOTHING`,
    );
    return invitation.email;
  });
  const existing = await one<{ provider_id: string }>(
    sql`SELECT provider_id FROM users WHERE lower(email)=${email} ORDER BY created_at LIMIT 1`,
  );
  await establish(existing?.provider_id || `invitation-${hash(email)}`, email);
  return { verified: true };
}
