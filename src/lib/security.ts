import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { sql, one } from "./db";
import { settings, secret } from "./config";
import { requireThat } from "./errors";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
// Supabase Auth returns the canonical email. Never remove plus aliases or dots.
export const emailHash = (canonicalEmail: string) =>
  createHmac("sha256", secret("ENTITLEMENT_HASH_SECRET"))
    .update(canonicalEmail)
    .digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function csrf(request: Request) {
  requireThat(
    request.headers.get("origin") === settings().origin,
    403,
    "This request must come from the Rev3 workspace.",
  );
  requireThat(
    request.headers.get("content-type")?.startsWith("application/json"),
    415,
    "JSON required.",
  );
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const row = await one<{ count: number }>(
    sql`INSERT INTO rate_limits(key,count,expires_at) VALUES(${key},1,now()+${seconds}*interval '1 second')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,
      expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+${seconds}*interval '1 second' ELSE rate_limits.expires_at END RETURNING count`,
  );
  const allowed = row.count <= limit;
  requireThat(
    allowed,
    429,
    "Please wait before trying again. Your saved work is safe.",
  );
}
export function verifyService(request: Request, raw: string) {
  const timestamp = request.headers.get("x-rev3-timestamp") || "";
  const nonce = request.headers.get("x-rev3-nonce") || "";
  const signature = request.headers.get("x-rev3-signature") || "";
  requireThat(
    /^\d{10}$/.test(timestamp) &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) <= 60 &&
      /^[a-zA-Z0-9-]{16,100}$/.test(nonce),
    401,
    "Invalid service authentication",
  );
  const expected = createHmac("sha256", secret("INTERNAL_SERVICE_SECRET"))
    .update(`${timestamp}.${nonce}.${new URL(request.url).pathname}.${raw}`)
    .digest("hex");
  requireThat(
    safeEqual(signature, expected),
    401,
    "Invalid service authentication",
  );
  return nonce;
}
export const csvCell = (value: unknown) =>
  '"' +
  String(value ?? "")
    .replace(/^[\s]*[=+@-]/, (m) => "'" + m)
    .replaceAll('"', '""') +
  '"';
