import { receiveEnquiry, issueInvitation, redeemInvitation, companyLeads } from "@/lib/company";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { identity, login, logout, developmentLogin } from "@/lib/auth";
import { sql, one, rows, locked } from "@/lib/db";
import { csrf, rateLimit, csvCell } from "@/lib/security";
import { AppError, requireThat } from "@/lib/errors";
import { settings, devAuth, liveUnavailable, localRepeatTests } from "@/lib/config";
import { voices, composePrompt } from "@/lib/catalogue";
import {
  saveConfiguration,
  saveFeedback,
  savePilot,
  saveConnections,
  deleteData,
} from "@/lib/workspace";
import { results, executeAction } from "@/lib/actions";
import {
  start,
  reserve,
  activate,
  ownedSession,
  tokenFor,
  terminate,
  roomClient,
  type Session,
} from "@/lib/sessions";
import { voicePreview, generateConfiguration } from "@/lib/providers";
import { workerRequest } from "@/lib/internal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  try {
    const route = (await context.params).path.join("/"),
      method = request.method;
    let raw = "",
      body: Record<string, unknown> = {};
    if (method !== "GET") {
      requireThat(
        Number(request.headers.get("content-length") || 0) <= 32000,
        413,
        "Request too large",
      );
      raw = await request.text();
      requireThat(Buffer.byteLength(raw) <= 32000, 413, "Request too large");
      if (route === "internal/events")
        return NextResponse.json(await workerRequest(request, raw));
      csrf(request);
      body = JSON.parse(raw || "{}");
    }
    const answer = async () => {
      if (route === "health") {
        await one(sql`SELECT 1 AS healthy`);
        return { status: "ok", mode: settings().mode };
      }
      if (route === "status")
        return {
          mode: settings().mode,
          devAuth: devAuth(),
          liveUnavailable: liveUnavailable(),
          repeatTests: localRepeatTests(),
          emailConfigured: !!process.env.SUPABASE_URL,
        };
      if (route === "auth/login" && method === "POST") {
        const v = z
          .object({
            email: z.email().max(254),
            token: z
              .string()
              .regex(/^\d{6,10}$/)
              .optional(),
          })
          .strict()
          .parse(body);
        return login(v.email, v.token);
      }
      if (route === "auth/development" && method === "POST") {
        await developmentLogin();
        return { simulation: true };
      }
      if (route === "auth/logout" && method === "POST") {
        await logout();
        return { ok: true };
      }
      if(route === "public/enquiry" && method === "POST") return receiveEnquiry(body);
      if(route === "auth/invite" && method === "POST") return redeemInvitation(body.code);
      const u = await identity();
      if(route === "admin/enquiries" && method === "GET") return {enquiries:await companyLeads(u)};
      if(route === "admin/invite" && method === "POST") return issueInvitation(u,body.email);
      if (method !== "GET") await rateLimit(`api:${u.id}`, 120, 60);
      if (route === "workspace" && method === "GET") {
        if (settings().mode === "simulation") {
          const expired = await rows<Session>(
            sql`SELECT * FROM voice_sessions WHERE workspace_id=${u.workspace_id} AND mode='simulation' AND state='active' AND deadline<now()`,
          );
          for (const s of expired) await terminate(s);
        }
        const [
          configuration,
          voice,
          entitlement,
          feedback,
          connections,
          pilots,
          outcome,
        ] = await Promise.all([
          one(
            sql`SELECT id,version,data FROM configurations WHERE workspace_id=${u.workspace_id} ORDER BY version DESC LIMIT 1`,
          ),
          one<{ voice: string }>(
            sql`SELECT voice FROM workspaces WHERE id=${u.workspace_id}`,
          ),
          one(
            sql`SELECT state FROM entitlements WHERE email_hash=${u.email_hash}`,
          ),
          rows(
            sql`SELECT * FROM feedback WHERE workspace_id=${u.workspace_id} ORDER BY created_at DESC`,
          ),
          one<{ data: unknown }>(
            sql`SELECT data FROM connections WHERE workspace_id=${u.workspace_id}`,
          ),
          rows(
            sql`SELECT id,created_at FROM pilot_requests WHERE workspace_id=${u.workspace_id}`,
          ),
          results(u.workspace_id),
        ]);
        return {
          user: {
            email: u.email,
            admin: u.admin,
            development: u.provider_id.startsWith("development-"),
          },
          configuration: configuration || null,
          voice: voice.voice,
          entitlement,
          feedback,
          connections: connections?.data || null,
          pilots,
          ...outcome,
        };
      }

      if (route === "configuration" && method === "POST")
        return saveConfiguration(u, body);
      if (route === "prompt" && method === "POST") {
        await rateLimit(`prompt:${u.id}`, 20, 3600);
        const v = z
          .object({
            description: z.string().max(2000),
            problems: z.array(z.string().max(200)).max(12),
            other: z.string().max(2000),
          })
          .strict()
          .parse(body);
        return { prompt: composePrompt(v.description, v.problems, v.other) };
      }
      if (route === "configuration/generate" && method === "POST")
        return generateConfiguration(
          u.id,
          z
            .object({ prompt: z.string().min(10).max(2000) })
            .strict()
            .parse(body).prompt,
        );
      if (route === "voices" && method === "GET") return { voices };
      if (route === "voice" && method === "POST") {
        const voice = z
          .object({ voice: z.enum(voices.map((v) => v.id)) })
          .strict()
          .parse(body).voice;
        await locked(async (tx) => {
          requireThat(
            !(await one(
              sql`SELECT id FROM voice_sessions WHERE workspace_id=${u.workspace_id} AND state IN ('reserved','active')`,
              tx,
            )),
            409,
            "Voice changes are locked during a test",
          );
          await tx.execute(
            sql`UPDATE workspaces SET voice=${voice} WHERE id=${u.workspace_id}`,
          );
        });
        return { voice };
      }
      if (route === "voice/preview" && method === "POST")
        return new Response(
          new Uint8Array(
            await voicePreview(
              u.id,
              z.object({ voice: z.string() }).strict().parse(body).voice,
            ),
          ),
          {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "private, max-age=86400",
            },
          },
        );
      if (route === "session/start" && method === "POST") {
        requireThat(
          body.acknowledged === true,
          422,
          "Acknowledge the AI demo and saved transcript before starting",
        );
        return start(u);
      }
      if (route === "session/rejoin" && method === "POST")
        return tokenFor(
          await ownedSession(z.string().uuid().parse(body.id), u),
        );
      if (route === "session/end" && method === "POST") {
        await terminate(
          await ownedSession(z.string().uuid().parse(body.id), u),
        );
        return { ended: true };
      }
      if (route === "simulation/start" && method === "POST") {
        const s = await reserve(u, "simulation");
        await locked((tx) => activate(s.id, tx));
        return { id: s.id, simulation: true };
      }
      if (route === "simulation/action" && method === "POST") {
        const s = await ownedSession(z.string().uuid().parse(body.id), u);
        requireThat(
          settings().mode === "simulation" && s.mode === "simulation",
          403,
          "Simulation only",
        );
        return executeAction(s.id, body.tool);
      }
      if (route === "feedback" && method === "POST")
        return saveFeedback(u, body);
      if (route === "connections" && method === "POST")
        return saveConnections(u, body);
      if (route === "pilot" && method === "POST") {
        await rateLimit(`pilot:${u.id}`, 5, 86400);
        return savePilot(u, body);
      }
      if (route === "delete" && method === "POST") {
        requireThat(
          body.confirmation === "DELETE",
          422,
          "Type DELETE to confirm",
        );
        const account = body.account === true;
        const r = await deleteData(u, account);
        if (account) await logout();
        return r;
      }
      if (route.startsWith("admin/")) {
        requireThat(u.admin, 403, "Owner access required");
        if (route === "admin/reset" && method === "POST") {
          const v = z
            .object({
              sessionId: z.string().uuid(),
              reason: z.string().min(20).max(1000),
              verifiedTechnicalFailure: z.literal(true),
            })
            .strict()
            .parse(body);
          const prior = await one<Session>(
            sql`SELECT * FROM voice_sessions WHERE id=${v.sessionId}`,
          );
          requireThat(
            prior && prior.mode === "live" && prior.error,
            422,
            "A recorded technical error is required",
          );
          if (prior.state === "reserved") {
            await terminate(prior);
            requireThat(
              (await roomClient().listRooms([prior.room])).length === 0,
              409,
              "Room must be closed before a reset",
            );
          }
          await locked(async (tx) => {
            const s = await one<Session>(
              sql`SELECT * FROM voice_sessions WHERE id=${v.sessionId}`,
              tx,
            );
            requireThat(
              s &&
                s.mode === "live" &&
                ["completed", "reserved"].includes(s.state) &&
                s.error,
              422,
              "Only recorded technical failures can be reset",
            );
            const e = await one<{ session_id: string; state: string }>(
              sql`SELECT session_id,state FROM entitlements WHERE email_hash=${s.email_hash}`,
              tx,
            );
            requireThat(
              e.session_id === s.id &&
                ["consumed", "reserved"].includes(e.state),
              409,
              "Entitlement no longer matches this failed test",
            );
            await tx.execute(
              sql`INSERT INTO admin_resets(id,actor,email_hash,previous_session,reason) VALUES(${randomUUID()},${u.provider_id},${s.email_hash},${s.id},${v.reason})`,
            );
            if (s.state === "reserved")
              await tx.execute(
                sql`UPDATE voice_sessions SET state='failed_before_activation',ended_at=now() WHERE id=${s.id}`,
              );
            await tx.execute(
              sql`UPDATE entitlements SET state='available',session_id=null,updated_at=now() WHERE email_hash=${s.email_hash}`,
            );
          });
          return { reset: true };
        }
        if (route === "admin/sessions" && method === "GET")
          return {
            sessions: await rows(
              sql`SELECT id,state,error,reserved_at,activated_at,ended_at FROM voice_sessions WHERE error IS NOT NULL ORDER BY reserved_at DESC LIMIT 100`,
            ),
          };
        if (
          (route === "admin/feedback" || route === "admin/export") &&
          method === "GET"
        ) {
          const data = await rows(
            sql`SELECT f.*,u.email FROM feedback f JOIN workspaces w ON w.id=f.workspace_id JOIN users u ON u.id=w.user_id ORDER BY f.created_at DESC LIMIT 1000`,
          );
          if (route === "admin/export")
            return new Response(
              [
                "id,email,category,voice,feedback",
                ...data.map((d) =>
                  [d.id, d.email, d.category, d.voice, JSON.stringify(d.data)]
                    .map(csvCell)
                    .join(","),
                ),
              ].join("\r\n"),
              {
                headers: {
                  "Content-Type": "text/csv; charset=utf-8",
                  "Content-Disposition":
                    'attachment; filename="rev3-feedback.csv"',
                },
              },
            );
          return { feedback: data };
        }
      }
      throw new AppError(404, "Not found");
    };
    const result = await answer();
    return result instanceof Response
      ? result
      : NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join("; "),
        },
        { status: 422 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Invalid JSON request" },
        { status: 400 },
      );
    // Inspect causes without exposing SQL parameters or credentials to users/logs.
    let cause: unknown = error;
    let connectionFailure = false;
    for (let depth = 0; cause && depth < 5; depth++) {
      const detail = cause as {
        code?: string;
        message?: string;
        cause?: unknown;
      };
      if (
        [
          "ETIMEDOUT",
          "ECONNRESET",
          "ECONNREFUSED",
          "ENETUNREACH",
          "EHOSTUNREACH",
          "ENOTFOUND",
          "EAI_AGAIN",
          "08006",
          "08001",
        ].includes(detail.code || "") ||
        /connection.*(timeout|terminated|closed)|connect.*timed out/i.test(
          detail.message || "",
        )
      )
        connectionFailure = true;
      cause = detail.cause;
    }
    if (connectionFailure)
      return NextResponse.json(
        {
          error:
            "The connection to the database was interrupted. Check your internet connection and try again. Previously saved setup is retained; unsaved changes are still in this form.",
        },
        { status: 503 },
      );
    // Never log provider responses, prompts, SQL parameters, credentials or customer details.
    console.error(
      "Rev3 request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      {
        error:
          "This request could not be completed. Your saved work is safe. Please try again later.",
      },
      { status: 503 },
    );
  }
}
export const GET = handler;
export const POST = handler;
