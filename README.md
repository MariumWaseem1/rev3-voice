# Rev3 Reception Co-Creation Platform

A Next.js application with verified-email workspaces, a durable PostgreSQL backend and a separate Python LiveKit voice worker. This directory is independent of the older dental/Vapi application and marketing site elsewhere in this repository.

**Current delivery:** working local simulation, persisted workflow actions and feedback, live-provider integration code, deployment configuration and automated checks. No paid accounts have been provisioned and nothing has been publicly deployed. Real email delivery, provider audio and production infrastructure must pass the [launch checks](docs/LAUNCH.md) before describing this as production ready.

## Run locally without provider accounts

Use Node 24 and pnpm 11.19.0. From this directory:

```powershell
Copy-Item .env.example .env.local
pnpm install --frozen-lockfile
```

Set `APP_MODE=simulation` and `DEV_AUTH_BYPASS=true` in `.env.local`, then run `pnpm dev`. Open **http://localhost:3000** (use that exact origin), select Get started and use the visibly labelled development simulation access. The embedded PostgreSQL database persists in `.data/rev3`; migrations apply on startup. Do not open that embedded database from a second process. It is for local development only.

Simulation makes no provider requests, creates no invented transcript, and never consumes a live entitlement. Shape a receptionist, review its facts, save a voice, start a workflow simulation and save a fictional enquiry. Results, feedback, connection requirements and pilot interest persist. Custom-prompt AI generation and voice previews report unavailable until live providers are configured; manual review remains usable.

For local network PostgreSQL, start Docker Desktop and run `docker compose up -d postgres`. Set `DATABASE_URL=postgresql://rev3:local-development-only@localhost:5433/rev3_development`, run `pnpm db:migrate`, then `pnpm dev`. These credentials and the loopback-only database port are development-only.

## What is implemented

- Guided and custom business setup, arbitrary business categories and needs, editable prompt, validated manual review, versioned immutable session snapshots, six allowlisted Deepgram voices and cached fixed-text previews.
- Supabase email OTP verification, private opaque-cookie sessions, account/workspace isolation and lifetime entitlement tombstones independent of account deletion.
- One live session per verified canonical email, at most 180 seconds after observed positive audio playback, early-end consumption, original-deadline rejoin, atomic reservations, bounded preparation, worker/maintenance shutdown and audited owner-only technical-failure resets.
- LiveKit browser microphone/audio and a persistent Python worker using Deepgram STT/TTS, DeepSeek tool calls and Silero VAD. No fallback provider and no app audio recording.
- Nine validated tools: services, availability, create/find/reschedule/cancel demo booking, enquiry, callback and staff follow-up. Conflicting appointments become requests, never confirmed bookings. Email/SMS previews are stored and explicitly **not sent**.
- Persisted transcript turns, action results, linked/editable feedback, requested connections, consented pilot interest, owner filtering/CSV export and privacy controls.
- Shared database rate limits, signed replay-resistant worker requests, tool idempotency, tenant checks, provider cost reservations, global concurrency/minutes limits, an enable switch, retention cleanup and a database-access lockdown migration.

## Accounts and deployment

You will need a **Supabase project, LiveKit Cloud project, Deepgram API account, DeepSeek API account, SMTP sender and production host/domain**. Put keys in `.env.local` or the host's secret manager; do not paste them into chat or browser source. The [setup guide](docs/LAUNCH.md) lists each value and the verification steps. The app has not created or purchased these accounts.

`render.yaml` prepares three services: web, continuous maintenance and continuous voice worker. It starts with `DEMO_ENABLED=false`. Render configuration is prepared, not applied. Deploying it can incur charges. The voice worker requires a continuously running Linux process; do not deploy it as a request handler or static site. Dockerfiles are provided; container builds and Render provisioning have not been executed on this computer.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
python -m pip install -r worker/requirements-dev.txt
python -m ruff check worker/agent.py worker/test_worker.py
python -m pytest worker/test_worker.py
```

Vitest normally uses isolated in-memory PGlite. Set `TEST_DATABASE_URL` only to a disposable PostgreSQL database whose name ends in `_test` to exercise the same tests against a server. Tests truncate app tables. Never point tests at production. CI is defined at the repository root in `.github/workflows/reception-ci.yml`.

The Linux worker SDK and Silero model loaded successfully in WSL. A Windows native SDK import crashed on this computer; use Linux for the worker. `worker/requirements-linux.lock` captures the resolved Linux packages; the worker container uses this lock. Refresh and validate it deliberately when upgrading dependencies. Browser interaction checks cover the local UI; they do not establish successful live audio or email delivery.

See [architecture and operations](docs/OPERATIONS.md) for state transitions, API contracts, retention and incident handling.


### Local sentiment reports

New live caller transcript turns are scored by Python `vaderSentiment==3.3.2` in the voice worker. Install the worker requirements and run migrations (including `005_sentiment.sql`) before starting it. Scores, model version and labels are stored with transcript turns and share their workspace access and deletion/retention rules. The results screen derives a donut chart and chronological sentiment markers from the saved scores. Existing calls without scores show an unavailable message; failed scoring does not interrupt a call.

This is English text sentiment, not acoustic tone recognition or a reliable measure of a person's emotions. Percentages describe analysed caller turns, not confidence or duration. Assistant turns are excluded. There are no additional provider requests for scoring. The existing transcription and voice providers still receive call data as before.

The worker instructions require spelling of collected names and emails, individual digits for collected numbers, and explicit read-back confirmation before tool use. They request natural concise speech and at most two unsuccessful clarification attempts before an appropriate alternative. These are LLM instructions, not deterministic guarantees; verify them with live conversational tests before release.

Validation: 45 application tests (including sentiment persistence/retry and assistant exclusion), five local Python sentiment tests, TypeScript and targeted ESLint passed. A rendered Edge fixture verified the report at 390px width. Acoustic tone analysis and a live evaluation of the revised dialogue rules remain outstanding.


### Combined company site and Studio

Local preview: `/company` for the marketing website, `/` for existing Studio, `/access` for invitations, `/studio` for the Studio UI on either deployment. Set `SITE_ROLE=marketing` on rev3.uk and `SITE_ROLE=studio` on voice.rev3.uk. Each service needs its own exact `APP_ORIGIN`; both use the same database. Set `STUDIO_ORIGIN=https://voice.rev3.uk` and `STUDIO_INVITE_REQUIRED=true` on both services. Preserve existing Resend settings and add the shared database/auth settings. Migration 006 adds enquiries, invitation hashes and approved membership with RLS enabled.

Public forms save first and attempt Resend delivery. A mail failure remains visible in Owner review; the application remains saved. Set `ADMIN_IDENTITIES` to the verified owner's Supabase ID, then sign in and open Owner review to approve Studio applications. Approval emails a 256-bit, one-use code with seven-day expiry; application submission never grants membership. Returning members use email OTP. Never put codes or server secrets in public configuration.

Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before release. Live Studio also needs the Python voice worker and the maintenance loop. Free Render web services can sleep; do not describe that configuration as an always-on production voice service. DNS names are already attached to the existing services. Keep both old deployments available until the replacement application, environment and worker are ready.
