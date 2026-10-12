import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { sql, one, locked } from "./db";
import { devAuth } from "./config";
import { emailHash, hash, newToken, rateLimit } from "./security";
import { requireThat } from "./errors";
export type Identity = {
  id: string;
  email: string;
  provider_id: string;
  workspace_id: string;
  email_hash: string;
  admin: boolean;
};
export function supabase(admin = false) {
  requireThat(
    process.env.SUPABASE_URL &&
      (admin
        ? process.env.SUPABASE_SERVICE_ROLE_KEY
        : process.env.SUPABASE_ANON_KEY),
    503,
    "Email sign-in is not configured yet. Please try again later.",
  );
  return createClient(
    process.env.SUPABASE_URL!,
    admin
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function login(email: string, token?: string) {
  await rateLimit("auth-global", 1000, 3600);
  await rateLimit(
    `auth:${hash(email.trim().toLowerCase())}`,
    token ? 10 : 3,
    600,
  );
  const client = supabase();
  if (!token) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    requireThat(
      !error,
      429,
      "We could not send a sign-in code. Please wait a minute and try again.",
    );
    return { sent: true };
  }
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  requireThat(
    !error && data.user?.email && data.user.email_confirmed_at,
    401,
    "That code is invalid or expired. Request a new code.",
  );
  const canonicalEmail=data.user.email.toLowerCase();
  if(process.env.STUDIO_INVITE_REQUIRED==="true") {
    const approved=await one(sql`SELECT email FROM studio_members WHERE email=${canonicalEmail}`);
    const admin=(process.env.ADMIN_IDENTITIES||"").split(",").map(v=>v.trim()).includes(data.user.id);
    requireThat(approved||admin,403,"Studio is invitation-only. Apply at rev3.uk or enter your invitation code.");
  }
  const invited=await one<{provider_id:string}>(sql`SELECT provider_id FROM users WHERE lower(email)=${canonicalEmail} AND provider_id LIKE 'invitation-%' LIMIT 1`);
  await establish(invited?.provider_id||data.user.id, canonicalEmail);
  return { verified: true };
}
export async function establish(providerId: string, email: string) {
  const token = newToken();
  await locked(async (tx) => {
    const u = await one<{ id: string }>(
      sql`INSERT INTO users(id,provider_id,email) VALUES(${randomUUID()},${providerId},${email}) ON CONFLICT(provider_id) DO UPDATE SET email=excluded.email RETURNING id`,
      tx,
    );
    await tx.execute(
      sql`INSERT INTO workspaces(id,user_id) VALUES(${randomUUID()},${u.id}) ON CONFLICT(user_id) DO NOTHING`,
    );
    await tx.execute(
      sql`INSERT INTO entitlements(email_hash) VALUES(${emailHash(email)}) ON CONFLICT DO NOTHING`,
    );
    await tx.execute(
      sql`INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(${hash(token)},${u.id},now()+interval '12 hours')`,
    );
  });
  (await cookies()).set("rev3_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 43200,
  });
}
export async function identity(): Promise<Identity> {
  const token = (await cookies()).get("rev3_session")?.value;
  requireThat(
    token,
    401,
    "Sign in with a verified email to open your workspace.",
  );
  const user = await one<{
    id: string;
    email: string;
    provider_id: string;
    workspace_id: string;
  }>(
    sql`SELECT u.id,u.email,u.provider_id,w.id AS workspace_id FROM auth_sessions a JOIN users u ON u.id=a.user_id JOIN workspaces w ON w.user_id=u.id WHERE a.token_hash=${hash(token)} AND a.expires_at>now()`,
  );
  requireThat(
    user,
    401,
    "Your sign-in has expired. Sign in again to restore your workspace.",
  );
  if(process.env.STUDIO_INVITE_REQUIRED==="true" && !(process.env.ADMIN_IDENTITIES||"").split(",").map(v=>v.trim()).includes(user.provider_id)) {
    requireThat(await one(sql`SELECT email FROM studio_members WHERE email=${user.email.toLowerCase()}`),403,"Studio invitation required. Apply at rev3.uk.");
  }
  return {
    ...user,
    email_hash: emailHash(user.email),
    admin: (process.env.ADMIN_IDENTITIES || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .includes(user.provider_id),
  };
}
export async function developmentLogin() {
  requireThat(devAuth(), 404, "Not found");
  await establish("development-only", "developer@example.test");
}
export async function logout() {
  const token = (await cookies()).get("rev3_session")?.value;
  if (token)
    await locked((tx) =>
      tx.execute(
        sql`DELETE FROM auth_sessions WHERE token_hash=${hash(token)}`,
      ),
    );
  (await cookies()).delete("rev3_session");
}
