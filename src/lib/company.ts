import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql, one, rows, locked } from "./db";
import { hash, newToken, rateLimit } from "./security";
import { requireThat } from "./errors";
import { login, type Identity } from "./auth";
export const applicationSchema=z.object({
 role:z.string().trim().min(1).max(100),
 callsPerWeek:z.enum(['Under 20','20-100','101-500','Over 500','Not sure yet']),
 teamSize:z.enum(['Just me','2-10','11-50','51+']),
 currentHandling:z.enum(['Me or my team','Receptionist','Answering service','Mostly missed / voicemail','Other']),
 goal:z.enum(['Bookings','Customer questions','Follow-ups','Admin tasks','Other']),
 tools:z.string().trim().max(500),
 readiness:z.enum(['This week','This month','Later']),
 feedback:z.enum(['Yes','Not right now'])
}).strict();
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
    application: applicationSchema.optional(),
  })
  .strict().superRefine((v,ctx)=>{if(v.kind==="studio"&&!v.application)ctx.addIssue({code:"custom",path:["application"],message:"Please complete the Studio application details."});});
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
        sql`INSERT INTO company_enquiries(id,kind,name,business,email,category,enquiry,application) VALUES(${id},${data.kind},${data.name},${data.business},${data.email},${data.category},${data.enquiry},${data.application?JSON.stringify(data.application):null}::jsonb)`,
      ),
    );
  try {
    await sendMail(
      process.env.ENQUIRY_TO_EMAIL || "info@rev3.uk",
      `Rev3 ${data.kind === "studio" ? "Studio application" : "enquiry"}: ${data.business}`,
      `Type: ${data.kind}\nName: ${data.name}\nBusiness: ${data.business}\nEmail: ${data.email}\nCategory: ${data.category}\n\n${data.enquiry}${data.application ? "\n\nStudio qualification details:\n"+Object.entries(data.application).map(([key,value])=>`${key}: ${value}`).join("\n") : ""}`,
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
export async function issueInvitation(u: Identity, emailInput: unknown, deliver = true) {
  requireThat(u.admin, 403, "Owner access required");
  const email = z.email().max(254).parse(emailInput).toLowerCase();
  await rateLimit(`issue-invite:${u.id}`, 20, 3600);
  const id = randomUUID(),
    code = newToken();
  await locked((tx) =>
    tx.execute(
      sql`INSERT INTO studio_invitations(id,email,token_hash,created_by,expires_at) VALUES(${id},${email},${hash(code)},${u.id},now()+interval '7 days')`,
    ),
  );
  if(deliver) await sendMail(
    email,
    "Your Rev3 Studio invitation",
    `You’re invited to Rev3 Studio, our co-creation programme.\n\nOpen ${process.env.STUDIO_ORIGIN || "https://voice.rev3.uk"}/access and enter this access code:\n\n${code}\n\nThis code is for you, works once and expires in 7 days. Verify this email address to enter. After joining, use your approved email to return.\n\nThe Rev3 team`,
    undefined,
    `invite-${id}`,
  );
  await locked((tx) =>
    tx.execute(
      sql`UPDATE studio_invitations SET expires_at=now()+interval '7 days' WHERE id=${id}`,
    ),
  );
  return { sent: deliver, code, email };
}
export async function redeemInvitation(input: unknown, emailInput: unknown, token?:string) {
  await rateLimit("studio-code-attempts",1000,3600);
  const code=z.string().trim().min(30).max(100).parse(input);
  const email=z.email().max(254).parse(emailInput).toLowerCase();
  return login(email,token,code);
}
