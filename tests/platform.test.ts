import {manageAccess,accessOverview,approveVerifiedInvitation} from "../src/lib/studio-access";
import { editSlot, bookingDashboard, deliverBookingEmails } from "../src/lib/bookings";
import {receiveEnquiry, issueInvitation, redeemInvitation, companyLeads} from "../src/lib/company";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }),
}));
import { database, sql, one, rows, locked } from "../src/lib/db";
import {
  login,
  establish,
  identity,
  logout,
  developmentLogin,
  type Identity,
} from "../src/lib/auth";
import {
  saveConfiguration,
  deleteData,
  saveFeedback,
  savePilot,
  cleanup,
} from "../src/lib/workspace";
import {
  blankConfiguration,
  configurationSchema,
  toolSchema,
  type Configuration,
} from "../src/lib/schemas";
import {
  reserve,
  activate,
  finish,
  ownedSession,
  tokenFor,
} from "../src/lib/sessions";
import { executeAction, results } from "../src/lib/actions";
import { slotWithinHours, candidateSlots } from "../src/lib/calendar";
import {
  csvCell,
  emailHash,
  verifyService,
  rateLimit,
} from "../src/lib/security";
import { devAuth, productionCheck } from "../src/lib/config";
import { voicePreview } from "../src/lib/providers";
import { composePrompt } from "../src/lib/catalogue";
import { GET, POST } from "../src/app/api/[...path]/route";
import { workerRequest } from "../src/lib/internal";
import { readFile, readdir } from "node:fs/promises";
let user: Identity;
async function workerEvent(s:{id:string;workerToken:string},kind:string,data:unknown=null,id=randomUUID(),nonce=randomUUID()){
 const raw=JSON.stringify({sessionId:s.id,workerToken:s.workerToken,kind,data,id}),timestamp=String(Math.floor(Date.now()/1000)),path='/api/internal/events';
 const signature=createHmac('sha256',process.env.INTERNAL_SERVICE_SECRET!).update(`${timestamp}.${nonce}.${path}.${raw}`).digest('hex');
 return workerRequest(new Request(`http://localhost:3000${path}`,{method:'POST',headers:{'x-rev3-timestamp':timestamp,'x-rev3-nonce':nonce,'x-rev3-signature':signature},body:raw}),raw);
}
describe('worker retry and crash boundaries',()=>{
 it('allows retry of the original claim, not another worker',async()=>{await live();const s=await reserve(user,'live'),id=randomUUID();await workerEvent(s,'claim',null,id);await workerEvent(s,'claim',null,id);await expect(workerEvent(s,'claim')).rejects.toThrow('claimed');});
 it('rejects replayed signed request nonces',async()=>{await live();const s=await reserve(user,'live'),id=randomUUID(),nonce=randomUUID();await workerEvent(s,'heartbeat',null,id,nonce);await expect(workerEvent(s,'heartbeat',null,id,nonce)).rejects.toThrow('Replayed');});
 it('holds entitlement when audio intent exists without a known outcome',async()=>{await live();const s=await reserve(user,'live');await workerEvent(s,'audio_intent');await locked(tx=>finish(s.id,'Worker lost',tx));expect((await one(sql`SELECT state FROM entitlements`)).state).toBe('reserved');await expect(reserve(user,'live')).rejects.toThrow('already');});
 it('settles definitive no-audio failure and observed audio differently',async()=>{await live();const s=await reserve(user,'live');await workerEvent(s,'audio_intent');await workerEvent(s,'finish',{error:'Failed before audio',audioObserved:false});expect((await one(sql`SELECT state FROM entitlements`)).state).toBe('failed_before_activation');const s2=await reserve(user,'live');await workerEvent(s2,'audio_intent');await workerEvent(s2,'finish',{error:'Failed after audio',audioObserved:true});expect((await one(sql`SELECT state FROM entitlements`)).state).toBe('consumed');});
 it('ignores delayed disconnects after a newer reconnect',async()=>{await live();const s=await reserve(user,'live'),now=Date.now();await workerEvent(s,'connected',{observedAt:new Date(now).toISOString()});await workerEvent(s,'disconnected',{observedAt:new Date(now-1000).toISOString()});expect((await ownedSession(s.id,user)).disconnected_at).toBeNull();});
 it('deduplicates persisted transcript turns across retries',async()=>{await live();const s=await reserve(user,'live'),turn={id:randomUUID(),role:'user',text:'Fictional enquiry'};await workerEvent(s,'transcript',turn);await workerEvent(s,'transcript',turn);expect(await rows(sql`SELECT * FROM transcript_turns`)).toHaveLength(1);});
 it('persists caller sentiment once and excludes assistant sentiment',async()=>{
 await live();const s=await reserve(user,'live');
 const sentiment={model:'vader-3.3.2',compound:0.8,label:'positive'};
 const turn={id:randomUUID(),role:'user',text:'Thank you, wonderful',sentiment};
 await workerEvent(s,'transcript',turn);await workerEvent(s,'transcript',turn);
 await workerEvent(s,'transcript',{id:randomUUID(),role:'assistant',text:'Happy to help',sentiment});
 const turns=await rows(sql`SELECT role,sentiment FROM transcript_turns`);
 expect(turns).toHaveLength(2);
 expect(turns.find(t=>t.role==='user')?.sentiment).toEqual(sentiment);
 expect(turns.find(t=>t.role==='assistant')?.sentiment).toBeNull();
 });
 it('labels development login honestly',async()=>{const response=await GET(new Request('http://localhost:3000/api/workspace'),{params:Promise.resolve({path:['workspace']})});expect((await response.json()).user.development).toBe(true);});
});
const full: Configuration = {
  ...blankConfiguration,
  businessName: "Any business",
  description: "We restore antique musical instruments.",
  category: "Custom craft",
  reviewed: true,
  tasks: [
    "Answer FAQs",
    "Capture enquiries",
    "Record callback requests",
    "Flag for staff",
    "Demo appointments",
  ],
  openingHours: Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    open: "09:00",
    close: "17:00",
  })),
  services: [
    { id: "repair", name: "Repair consultation", minutes: 30, price: "" },
  ],
};
const future = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  d.setUTCHours(11, 0, 0, 0);
  return d.toISOString();
};
async function live() {
  await locked(tx=>tx.execute(sql`INSERT INTO studio_members(email,approved_by) VALUES('one@example.test','test'),('two@example.test','test') ON CONFLICT DO NOTHING`));
  process.env.APP_MODE = "live";
  process.env.DATABASE_URL = "postgres://test-only";
  process.env.DEMO_ENABLED = "true";
  for (const key of [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "DEEPGRAM_API_KEY",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "DEEPGRAM_STT_MODEL",
  ])
    process.env[key] = "test-placeholder-not-a-secret";
  process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
}
async function activeSimulation() {
  const s = await reserve(user, "simulation");
  await locked((tx) => activate(s.id, tx));
  return s;
}
beforeAll(async () => {
  process.env.APP_MODE = "simulation";
  process.env.DEV_DATABASE_PATH = "memory://";
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith("_test"))
      throw new Error(
        "Destructive tests require a database name ending in _test",
      );
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else delete process.env.DATABASE_URL;
  process.env.ENTITLEMENT_HASH_SECRET = "a".repeat(40);
  process.env.INTERNAL_SERVICE_SECRET = "b".repeat(40);
  await database();
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      for (const file of (await readdir("migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await pool.query(await readFile(`migrations/${file}`, "utf8"));
    } finally {
      await pool.end();
    }
  }
});
beforeEach(async () => {
  vi.unstubAllGlobals();
  jar.clear();
  process.env.APP_MODE = "simulation";
  process.env.DEV_AUTH_BYPASS = "false";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.GLOBAL_CONCURRENCY = "5";
  process.env.MONTHLY_MINUTES = "300";
  process.env.MONTHLY_ESTIMATED_BUDGET_GBP = "100";
  delete process.env.DATABASE_URL;
  delete process.env.ADMIN_IDENTITIES;
  delete process.env.STUDIO_INVITE_REQUIRED;
  delete process.env.RESEND_API_KEY;
  await (
    await database()
  ).execute(
    sql`TRUNCATE users,entitlements,usage_ledger,admin_resets,rate_limits,voice_previews,company_enquiries,studio_invitations,studio_members CASCADE`,
  );
  await establish("development-test", "one@example.test");
  user = await identity();
  await saveConfiguration(user, full);
});
describe("verified identity and request boundary", () => {
  it("rejects workspace access without a verified login session", async () => {
    jar.clear();
    await expect(identity()).rejects.toThrow("Sign in");
    const response = await GET(
      new Request("http://localhost:3000/api/workspace"),
      { params: Promise.resolve({ path: ["workspace"] }) },
    );
    expect(response.status).toBe(401);
  });
  it("does not authenticate by merely supplying an email", async () => {
    await logout();
    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "unverified@example.test" }),
      }),
      { params: Promise.resolve({ path: ["auth", "login"] }) },
    );
    expect(response.status).toBe(403);
    await expect(identity()).rejects.toThrow();
  });
  it("rejects cross-origin mutation", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/configuration", {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
        body: JSON.stringify(full),
      }),
      { params: Promise.resolve({ path: ["configuration"] }) },
    );
    expect(response.status).toBe(403);
  });
  it("fails closed for development auth in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DEV_AUTH_BYPASS = "true";
    expect(devAuth()).toBe(false);
    await expect(developmentLogin()).rejects.toThrow();
    expect(() => productionCheck()).toThrow();
    vi.unstubAllEnvs();
  });
  it("keeps dots and plus tags in provider canonical identity", () => {
    expect(emailHash("a.b+tag@example.test")).not.toBe(
      emailHash("ab@example.test"),
    );
  });
  it("denies ordinary owner review", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/admin/feedback"),
      { params: Promise.resolve({ path: ["admin", "feedback"] }) },
    );
    expect(response.status).toBe(403);
  });
  it("enforces a durable shared rate limit", async () => {
    await rateLimit("limit", 1, 60);
    await expect(rateLimit("limit", 1, 60)).rejects.toThrow("wait");
  });
});
describe("one lifetime test and atomic usage", () => {
  it("allows only one of two concurrent start reservations", async () => {
    await live();
    const responses = await Promise.allSettled([
      reserve(user, "live"),
      reserve(user, "live"),
    ]);
    expect(responses.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await rows(sql`SELECT * FROM usage_ledger`)).toHaveLength(1);
  });
  it("preserves entitlement after failure before activation", async () => {
    await live();
    const s = await reserve(user, "live");
    await locked((tx) => finish(s.id, "Dispatch failed", tx));
    expect((await one(sql`SELECT state FROM entitlements`)).state).toBe(
      "failed_before_activation",
    );
    expect((await reserve(user, "live")).id).not.toBe(s.id);
  });
  it("ending early after activation consumes the test permanently", async () => {
    await live();
    const s = await reserve(user, "live");
    await locked((tx) => activate(s.id, tx));
    await locked((tx) => finish(s.id, null, tx));
    await expect(reserve(user, "live")).rejects.toThrow("used");
    await logout();
    await establish("development-test", "one@example.test");
    await expect(reserve(await identity(), "live")).rejects.toThrow("used");
  });
  it("data and account deletion do not reset entitlement", async () => {
    await live();
    const s = await reserve(user, "live");
    await locked((tx) => activate(s.id, tx));
    await locked((tx) => finish(s.id, null, tx));
    await deleteData(user, false);
    expect((await one(sql`SELECT state FROM entitlements`)).state).toBe(
      "consumed",
    );
    await deleteData(user, true);
    await manageAccess({...user,admin:true},{operation:"approve",email:"one@example.test"});
    await establish("development-new", "one@example.test");
    user = await identity();
    await saveConfiguration(user, full);
    await expect(reserve(user, "live")).rejects.toThrow("used");
  });
  it("missing credentials do not reserve or consume a test", async () => {
    process.env.APP_MODE = "live";
    process.env.DEMO_ENABLED = "false";
    await expect(reserve(user, "live")).rejects.toThrow("unavailable");
    expect(await rows(sql`SELECT * FROM voice_sessions`)).toHaveLength(0);
    expect((await one(sql`SELECT state FROM entitlements`)).state).toBe(
      "available",
    );
  });
  it("simulation never consumes the production allowance", async () => {
    const s = await activeSimulation();
    await locked((tx) => finish(s.id, null, tx));
    expect((await one(sql`SELECT state FROM entitlements`)).state).toBe(
      "available",
    );
    expect(await rows(sql`SELECT * FROM usage_ledger`)).toHaveLength(0);
  });
  it("global concurrency is reserved across users", async () => {
    await live();
    process.env.GLOBAL_CONCURRENCY = "1";
    await reserve(user, "live");
    await establish("development-two", "two@example.test");
    const other = await identity();
    await saveConfiguration(other, full);
    await expect(reserve(other, "live")).rejects.toThrow("capacity");
    expect(
      (
        await one(
          sql`SELECT state FROM entitlements WHERE email_hash=${other.email_hash}`,
        )
      ).state,
    ).toBe("available");
  });
  it("monthly hard minutes include preparation reserve", async () => {
    await live();
    process.env.MONTHLY_MINUTES = "3";
    await expect(reserve(user, "live")).rejects.toThrow("capacity");
    expect(await rows(sql`SELECT * FROM voice_sessions`)).toHaveLength(0);
  });
  it("rejoin keeps the original session and deadline", async () => {
    await live();
    const s = await reserve(user, "live");
    const a = await locked((tx) => activate(s.id, tx));
    const t1 = await tokenFor(a);
    const t2 = await tokenFor(a);
    expect(t1.id).toBe(t2.id);
    expect(t1.deadline).toEqual(t2.deadline);
    expect(
      new Date(a.deadline!).getTime() - new Date(a.activated_at!).getTime(),
    ).toBe(180000);
  });
  it("rejects expired sessions and expired reconnection grace", async () => {
    await live();
    const s = await reserve(user, "live");
    const a = await locked((tx) => activate(s.id, tx));
    await expect(
      tokenFor({ ...a, deadline: new Date(Date.now() - 1000) }),
    ).rejects.toThrow("ended");
    await expect(
      tokenFor({ ...a, disconnected_at: new Date(Date.now() - 31000) }),
    ).rejects.toThrow("window");
  });
  it("stale and out of order activation cannot resurrect a test", async () => {
    const s = await reserve(user, "simulation");
    await locked((tx) => finish(s.id, "failed", tx));
    await expect(locked((tx) => activate(s.id, tx))).rejects.toThrow("expired");
  });
  it("configuration snapshots stay immutable and edits are locked during testing", async () => {
    const s = await activeSimulation();
    await expect(
      saveConfiguration(user, { ...full, businessName: "Changed" }),
    ).rejects.toThrow("Finish");
    expect((await ownedSession(s.id, user)).snapshot.businessName).toBe(
      full.businessName,
    );
  });
});
describe("real persisted demo actions", () => {
  it("denies another workspace session", async () => {
    const s = await activeSimulation();
    await establish("development-other", "other@example.test");
    await expect(ownedSession(s.id, await identity())).rejects.toThrow(
      "not found",
    );
  });
  it("commits one booking for concurrent conflicting requests; records the other as request", async () => {
    await editSlot(user,{operation:"add",serviceId:"repair",start:future()});
    const s = await activeSimulation();
    const args = {
      serviceId: "repair",
      start: future(),
      customer: "Fictional Pat",
      contact: "pat@example.test",
    };
    const r = await Promise.all([
      executeAction(s.id, {
        name: "create_demo_booking",
        key: randomUUID(),
        args,
      }),
      executeAction(s.id, {
        name: "create_demo_booking",
        key: randomUUID(),
        args,
      }),
    ]);
    expect(r.filter((r) => r.confirmed)).toHaveLength(1);
    expect(r.find((r) => r.confirmed === false)?.message).toBe(
      "Appointment request recorded",
    );
    expect(await rows(sql`SELECT * FROM demo_bookings`)).toHaveLength(1);
    expect(
      await rows(
        sql`SELECT * FROM customer_records WHERE kind='appointment_request'`,
      ),
    ).toHaveLength(1);
    expect(
      (await rows(sql`SELECT * FROM confirmation_previews`)).every(
        (p) => p.status === "Preview only — not sent",
      ),
    ).toBe(true);
  });
  it("idempotent retries never duplicate mutations", async () => {
    const s = await activeSimulation();
    const tool = {
      name: "request_callback",
      key: randomUUID(),
      args: {
        customer: "Demo Pat",
        contact: "fictional",
        details: "Call about repairs",
      },
    };
    expect(await executeAction(s.id, tool)).toEqual(
      await executeAction(s.id, tool),
    );
    expect(await rows(sql`SELECT * FROM customer_records`)).toHaveLength(1);
    await expect(
      executeAction(s.id, {
        ...tool,
        args: { ...tool.args, details: "different" },
      }),
    ).rejects.toThrow("different action");
  });
  it("reschedules and cancels only with matching workspace and contact", async () => {
    await editSlot(user,{operation:"add",serviceId:"repair",start:future()});
    await editSlot(user,{operation:"add",serviceId:"repair",start:new Date(new Date(future()).getTime()+86400000).toISOString()});
    const s = await activeSimulation();
    const created = await executeAction(s.id, {
      name: "create_demo_booking",
      key: randomUUID(),
      args: {
        serviceId: "repair",
        start: future(),
        customer: "Pat",
        contact: "correct",
      },
    });
    const booking = created.booking as { reference: string };
    const later = new Date(
      new Date(future()).getTime() + 86400000,
    ).toISOString();
    const denied = await executeAction(s.id, {
      name: "cancel_demo_booking",
      key: randomUUID(),
      args: { reference: booking.reference, contact: "wrong" },
    });
    expect(denied.status).toBe("error");
    const rescheduled = await executeAction(s.id, {
      name: "reschedule_demo_booking",
      key: randomUUID(),
      args: { reference: booking.reference, contact: "correct", start: later },
    });
    expect(rescheduled.message).toBe("Demo booking rescheduled");
    const cancelled = await executeAction(s.id, {
      name: "cancel_demo_booking",
      key: randomUUID(),
      args: { reference: booking.reference, contact: "correct" },
    });
    expect(cancelled.confirmation).toBe(
      "Your demo appointment has been cancelled.",
    );
    expect((await one(sql`SELECT status FROM demo_bookings`)).status).toBe(
      "cancelled",
    );
  });
  it("rejects actions after authoritative deadline", async () => {
    const s = await activeSimulation();
    await locked((tx) =>
      tx.execute(
        sql`UPDATE voice_sessions SET deadline=now()-interval '1 second' WHERE id=${s.id}`,
      ),
    );
    await expect(
      executeAction(s.id, {
        name: "capture_enquiry",
        key: randomUUID(),
        args: { customer: "Pat", details: "Test" },
      }),
    ).rejects.toThrow("not active");
  });
  it("validates arguments and rejects unsupported tools", () => {
    expect(
      toolSchema.safeParse({ name: "send_sms", key: randomUUID(), args: {} })
        .success,
    ).toBe(false);
  });
  it("uses timezone and daylight-saving offsets", () => {
    const c = { ...full, timezone: "Europe/London" };
    const n = Date.parse("2027-01-01");
    expect(slotWithinHours("2027-07-05T08:00:00Z", 30, c, n)).toBe(false);
    const nearer = Date.parse("2027-06-01");
    expect(slotWithinHours("2027-07-05T08:00:00Z", 30, c, nearer)).toBe(true);
    expect(slotWithinHours("2027-07-05T07:30:00Z", 30, c, nearer)).toBe(false);
    expect(slotWithinHours("2027-07-05T15:45:00Z", 30, c, nearer)).toBe(false);
  });
  it("does not offer invalid or past availability", () => {
    expect(candidateSlots("2020-01-01", 30, full)).toEqual([]);
    expect(candidateSlots("invalid", 30, full)).toEqual([]);
  });
  it("keeps action results independent of generated summaries", async () => {
    const s = await activeSimulation();
    await executeAction(s.id, {
      name: "capture_enquiry",
      key: randomUUID(),
      args: { customer: "Fictional Pat", details: "Need help" },
    });
    const r = await results(user.workspace_id);
    expect(r.records).toHaveLength(1);
    expect(r.bookings).toHaveLength(0);
    expect(r.turns).toHaveLength(0);
  });
});
describe("configuration, feedback, previews and privacy", () => {
  it("supports arbitrary businesses and records unsupported custom needs", async () => {
    const custom = {
      ...full,
      category: "Meteorite conservation",
      otherProblem: "Launch a spacecraft",
      tasks: ["Capture enquiries"] as Configuration["tasks"],
    };
    const saved = await saveConfiguration(user, custom);
    expect((saved.data as Configuration).otherProblem).toBe(
      "Launch a spacecraft",
    );
    expect(
      composePrompt("a meteorite museum", ["Repetitive questions"]),
    ).toContain("a meteorite museum");
  });
  it("rejects invented voice ids", () => {
    expect(
      configurationSchema.safeParse({ ...full, voice: "made-up-voice" })
        .success,
    ).toBe(false);
  });
  it("does not generate previews in simulation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(voicePreview(user.id, "aura-2-thalia-en")).rejects.toThrow(
      "unavailable",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("caches a fixed-text voice preview", async () => {
    await live();
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await voicePreview(user.id, "aura-2-thalia-en");
    await voicePreview(user.id, "aura-2-thalia-en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].body).toContain(
      "Hello, thanks for calling. How can I help you today?",
    );
  });
  it("persists and edits feedback for a failed test", async () => {
    const s = await reserve(user, "simulation");
    await locked((tx) => finish(s.id, "provider failed", tx));
    const data = {
      sessionId: s.id,
      goal: "Ask about repairs",
      understood: 1,
      completed: "no",
      natural: 1,
      confusing: "Could not connect",
      change: "Improve connection",
      needs: "Custom workflow",
      failureCategory: "connection",
    };
    const saved = await saveFeedback(user, data);
    await saveFeedback(user, {
      ...data,
      id: saved.id,
      change: "A clearer connection error",
    });
    const f = await one<{ data: { change: string } }>(
      sql`SELECT data FROM feedback`,
    );
    expect(f.data.change).toBe("A clearer connection error");
    expect(await rows(sql`SELECT * FROM feedback`)).toHaveLength(1);
  });
  it("binds pilot request to the verified email and requires consent", async () => {
    const data = {
      businessName: "Museum",
      contactName: "Pat",
      phone: "",
      description: "Museum",
      callVolume: "10",
      mainProblem: "Enquiries",
      systems: "Custom",
      contactTime: "Morning",
      permission: true,
    };
    await savePilot(user, data);
    expect((await one(sql`SELECT email FROM pilot_requests`)).email).toBe(
      user.email,
    );
    await expect(
      savePilot(user, { ...data, permission: false }),
    ).rejects.toThrow();
  });
  it("retention removes records but never the entitlement tombstone", async () => {
    const s = await activeSimulation();
    await locked((tx) => finish(s.id, null, tx));
    await locked((tx) =>
      tx.execute(
        sql`UPDATE voice_sessions SET reserved_at=now()-interval '31 days' WHERE id=${s.id}`,
      ),
    );
    await cleanup();
    expect(await rows(sql`SELECT * FROM voice_sessions`)).toHaveLength(0);
    expect(await rows(sql`SELECT * FROM entitlements`)).toHaveLength(1);
  });
  it("rejects forged and expired worker signatures", () => {
    const raw = "{}",
      nonce = randomUUID(),
      timestamp = String(Math.floor(Date.now() / 1000)),
      path = "/api/internal/events";
    const signature = createHmac("sha256", process.env.INTERNAL_SERVICE_SECRET!)
      .update(`${timestamp}.${nonce}.${path}.${raw}`)
      .digest("hex");
    const request = new Request(`http://localhost:3000${path}`, {
      headers: {
        "x-rev3-timestamp": timestamp,
        "x-rev3-nonce": nonce,
        "x-rev3-signature": signature,
      },
    });
    expect(verifyService(request, raw)).toBe(nonce);
    expect(() => verifyService(request, '{"forged":true}')).toThrow();
  });
  it("escapes spreadsheet formula injection", () => {
    for (const value of ["=1+1", "+SUM(A1)", "@cmd", "-1", '  =HYPERLINK("x")'])
      expect(csvCell(value)).toMatch(/^"'/);
    expect(csvCell("ordinary")).toBe('"ordinary"');
  });
});

describe("company applications and Studio access",()=>{
 const lead={kind:"studio",name:"Test",business:"Test business",email:"applicant@example.test",category:"Other",enquiry:"Help with incoming calls",website:"",application:{role:"Owner",callsPerWeek:"20-100",teamSize:"2-10",currentHandling:"Me or my team",goal:"Bookings",tools:"",readiness:"This month",feedback:"Yes"}};
 it("saves applications even when email delivery is unavailable",async()=>{await receiveEnquiry(lead);const saved=await one(sql`SELECT * FROM company_enquiries`);expect(saved.kind).toBe("studio");expect(saved.mail_status).toBe("failed");expect(await rows(sql`SELECT * FROM studio_members`)).toHaveLength(0)});
 it("validates enquiries and ignores honeypot submissions",async()=>{await expect(receiveEnquiry({...lead,email:"bad"})).rejects.toThrow();await receiveEnquiry({...lead,website:"spam"});expect(await rows(sql`SELECT * FROM company_enquiries`)).toHaveLength(0)});
 it("does not expose leads or issue invitations to non-owners",async()=>{await expect(companyLeads(user)).rejects.toThrow("Owner");await expect(issueInvitation(user,lead.email)).rejects.toThrow("Owner")});
 it("keeps codes pending until the recipient verifies email",async()=>{
 const result=await issueInvitation({...user,admin:true},lead.email,false);
 const stored=await one(sql`SELECT * FROM studio_invitations`);expect(stored.token_hash).not.toBe(result.code);
 expect(await rows(sql`SELECT * FROM studio_members`)).toHaveLength(0);
 await expect(redeemInvitation(result.code,'other@example.test')).rejects.toThrow('invalid');
 await approveVerifiedInvitation(lead.email,result.code);
 expect(await rows(sql`SELECT * FROM studio_members`)).toHaveLength(1);
 await expect(approveVerifiedInvitation(lead.email,result.code)).rejects.toThrow('already used');
 });
 it("rejects unapproved email before sending OTP and protects owner controls",async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 await expect(login('unknown@example.test')).rejects.toThrow('not been approved');expect(f).not.toHaveBeenCalled();
 await expect(manageAccess(user,{operation:'approve',email:lead.email})).rejects.toThrow('Owner');
 await expect(accessOverview(user)).rejects.toThrow('Owner');
 });
 it("approves emails and revokes membership, sessions and codes",async()=>{
 const admin={...user,admin:true};await manageAccess(admin,{operation:'approve',email:lead.email});
 const invitation=await issueInvitation(admin,lead.email,false);
 await establish('approved-test',lead.email);process.env.STUDIO_INVITE_REQUIRED='true';expect((await identity()).email).toBe(lead.email);
 await manageAccess(admin,{operation:'revoke',email:lead.email});
 await expect(identity()).rejects.toThrow('expired');
 await expect(approveVerifiedInvitation(lead.email,invitation.code)).rejects.toThrow('invalid');
 });
 it("requires email OTP before consuming a valid invitation",async()=>{
 const invite=await issueInvitation({...user,admin:true},lead.email,false);jar.clear();
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='test';
 const fetcher=vi.fn(async(url)=>new Response(String(url).includes('/verify')?JSON.stringify({user:{id:'verified-provider',email:lead.email,email_confirmed_at:new Date().toISOString()}}):'{}',{status:200,headers:{'Content-Type':'application/json'}}));
 vi.stubGlobal('fetch',fetcher);
 try {
 expect(await login(lead.email,undefined,invite.code)).toEqual({sent:true});
 expect(jar.has('rev3_session')).toBe(false);expect((await one(sql`SELECT redeemed_at FROM studio_invitations`)).redeemed_at).toBeNull();
 expect(await login(lead.email,'123456',invite.code)).toEqual({verified:true});
 expect((await identity()).email).toBe(lead.email);
 expect((await one(sql`SELECT redeemed_at FROM studio_invitations`)).redeemed_at).not.toBeNull();
 }finally{delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;}
 });
 it("does not consume invitations when email verification fails",async()=>{
 const invite=await issueInvitation({...user,admin:true},lead.email,false);jar.clear();
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='test';
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({msg:'Invalid OTP',error_code:'otp_expired'}),{status:403,headers:{'Content-Type':'application/json'}})));
 try {await expect(login(lead.email,'123456',invite.code)).rejects.toThrow('invalid or expired');expect(jar.has('rev3_session')).toBe(false);expect((await one(sql`SELECT redeemed_at FROM studio_invitations`)).redeemed_at).toBeNull();expect(await rows(sql`SELECT * FROM studio_members`)).toHaveLength(0);}
 finally{delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;}
 });
 it("rejects expired invitations and existing unapproved sessions",async()=>{
 process.env.STUDIO_INVITE_REQUIRED="true";await expect(identity()).rejects.toThrow("invitation required");
 await expect(redeemInvitation("invalid-code-with-more-than-thirty-characters",lead.email)).rejects.toThrow("invalid");
 });
});

describe('published booking slots and confirmations',()=>{
 it('only offers published times, prevents overlap and isolates workspaces',async()=>{
  const s=await activeSimulation();const date=future().slice(0,10);
  const available=()=>executeAction(s.id,{name:'check_demo_availability',key:randomUUID(),args:{serviceId:'repair',date}});
  expect((await available()).slots).toEqual([]);
  await editSlot(user,{operation:'add',serviceId:'repair',start:future()});
  expect((await available()).slots).toHaveLength(1);
  await expect(editSlot(user,{operation:'add',serviceId:'repair',start:future()})).rejects.toThrow('overlaps');
  const slot=(await bookingDashboard(user)).slots[0];
  await establish('development-other','other@example.test');const other=await identity();
  expect((await bookingDashboard(other)).slots).toHaveLength(0);
  await expect(editSlot(other,{operation:'remove',id:slot.id})).rejects.toThrow('not found');
 });
 it('queues both recipients once, preserves booking on mail failure and retries delivery',async()=>{
  await editSlot(user,{operation:'add',serviceId:'repair',start:future()});await live();
  const s=await reserve(user,'live');await locked(tx=>activate(s.id,tx));
  const tool={name:'create_demo_booking',key:randomUUID(),args:{serviceId:'repair',start:future(),customer:'Test caller',contact:'caller@example.test'}};
  const created=await executeAction(s.id,tool);expect(created.confirmed).toBe(true);
  await executeAction(s.id,tool);expect(await rows(sql`SELECT * FROM booking_emails`)).toHaveLength(2);
  const slot=(await bookingDashboard(user)).slots[0];await expect(editSlot(user,{operation:'remove',id:slot.id})).rejects.toThrow('booking');
  process.env.RESEND_API_KEY='test-only';vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})));
  await deliverBookingEmails();expect((await bookingDashboard(user)).bookings).toHaveLength(1);
  expect((await rows(sql`SELECT * FROM booking_emails`)).every(e=>e.status==='pending')).toBe(true);
  await locked(tx=>tx.execute(sql`UPDATE booking_emails SET next_attempt_at=now()`));
  const send=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',send);
  await deliverBookingEmails();await deliverBookingEmails();expect(send).toHaveBeenCalledTimes(2);
  expect((await rows(sql`SELECT * FROM booking_emails`)).every(e=>e.status==='sent')).toBe(true);
 });
});
import { adminOverview, adminPerson, adminConversation } from '../src/lib/admin';
describe('owner activity access',()=>{
 it('blocks non-owners from account and conversation data',async()=>{
  await expect(adminOverview(user)).rejects.toThrow('Owner');
  await expect(adminPerson(user,user.id)).rejects.toThrow('Owner');
  await expect(adminConversation(user,randomUUID())).rejects.toThrow('Owner');
  const response=await GET(new Request('http://localhost:3000/api/admin/overview'),{params:Promise.resolve({path:['admin','overview']})});expect(response.status).toBe(403);
 });
 it('shows saved activity to an owner and handles unknown calls',async()=>{
  const s=await activeSimulation();const owner={...user,admin:true};
  await locked(tx=>tx.execute(sql`INSERT INTO transcript_turns(id,session_id,role,text) VALUES(${randomUUID()},${s.id},'user','Test conversation')`));
  expect((await adminOverview(owner)).people).toHaveLength(1);
  expect((await adminPerson(owner,user.id)).calls).toHaveLength(1);
  expect((await adminConversation(owner,s.id)).turns[0].text).toBe('Test conversation');
  await expect(adminConversation(owner,randomUUID())).rejects.toThrow('not found');
 });
});
