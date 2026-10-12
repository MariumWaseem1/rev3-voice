const num = (key: string, fallback: number) => {
  const v = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid ${key}`);
  return v;
};
export const settings = () => ({
  mode:
    process.env.APP_MODE === "live"
      ? ("live" as const)
      : ("simulation" as const),
  origin: process.env.APP_ORIGIN || "http://localhost:3000",
  timeout: Math.min(180, num("DEMO_TIMEOUT_SECONDS", 180)),
  reservationTimeout: Math.min(90, num("RESERVATION_TIMEOUT_SECONDS", 60)),
  grace: Math.min(30, num("REJOIN_GRACE_SECONDS", 30)),
  concurrency: num("GLOBAL_CONCURRENCY", 5),
  minutes: num("MONTHLY_MINUTES", 300),
  budget: num("MONTHLY_ESTIMATED_BUDGET_GBP", 100),
  cost: num("ESTIMATED_COST_PER_MINUTE_GBP", 0.3),
  retention: num("RETENTION_DAYS", 30),
});
export const devAuth = () =>
  process.env.NODE_ENV !== "production" &&
  settings().mode === "simulation" &&
  process.env.DEV_AUTH_BYPASS === "true";
export function secret(name: string): string {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV !== "production" && settings().mode === "simulation")
    return `local-development-only-${name}-do-not-deploy`;
  throw new Error(`${name} must contain at least 32 characters`);
}
export function liveUnavailable(): string | null {
  if (settings().mode !== "live")
    return "Simulation mode : no live voice conversation or provider spend.";
  if (process.env.DEMO_ENABLED !== "true")
    return "Live co-creation testing is currently unavailable. Your setup and feedback remain available.";
  if (process.env.LIVE_CALLS_ENABLED === "false")
    return "Voice calls are being prepared. You can choose a voice and listen to previews now.";
  const keys = [
    "DATABASE_URL",
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "DEEPGRAM_API_KEY",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "DEEPGRAM_STT_MODEL",
    "INTERNAL_SERVICE_SECRET",
    "ENTITLEMENT_HASH_SECRET",
  ];
  if (keys.some((k) => !process.env[k]))
    return "Live testing is not configured yet. Your test allowance is safe.";
  return null;
}
export function productionCheck() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DEV_AUTH_BYPASS === "true")
    throw new Error("Development authentication is forbidden in production");
  if (!process.env.DATABASE_URL || !settings().origin.startsWith("https://"))
    throw new Error("Production requires PostgreSQL and HTTPS APP_ORIGIN");
  secret("ENTITLEMENT_HASH_SECRET");
  secret("INTERNAL_SERVICE_SECRET");
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ])
    if (!process.env[key]) throw new Error(`Missing ${key}`);
}

export function localRepeatTests() {
  if (process.env.NODE_ENV === "production" || process.env.LOCAL_REPEAT_TESTS !== "true") return false;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(settings().origin).hostname); }
  catch { return false; }
}
