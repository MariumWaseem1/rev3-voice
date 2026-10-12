CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS control (id integer PRIMARY KEY CHECK(id=1), tick bigint NOT NULL DEFAULT 0);
INSERT INTO control(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, provider_id text UNIQUE NOT NULL, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
 id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE,
 voice text NOT NULL DEFAULT 'aura-2-thalia-en', created_at timestamptz NOT NULL DEFAULT now()
);
-- Release-lifetime entitlement tombstones intentionally have no FK to deletable user data.
CREATE TABLE IF NOT EXISTS entitlements (
 email_hash text PRIMARY KEY, state text NOT NULL DEFAULT 'available' CHECK(state IN ('available','reserved','active','consumed','failed_before_activation')),
 session_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS configurations (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
 version integer NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,version), UNIQUE(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS voice_sessions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
 configuration_id uuid NOT NULL, snapshot jsonb NOT NULL, email_hash text NOT NULL REFERENCES entitlements,
 mode text NOT NULL CHECK(mode IN ('live','simulation')), state text NOT NULL CHECK(state IN ('reserved','active','completed','failed_before_activation')),
 room text NOT NULL UNIQUE, identity text NOT NULL UNIQUE, worker_hash text,
 reserved_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz, deadline timestamptz,
 ended_at timestamptz, disconnected_at timestamptz, worker_seen_at timestamptz, audio_intent_at timestamptz, error text,
 FOREIGN KEY(configuration_id,workspace_id) REFERENCES configurations(id,workspace_id), UNIQUE(id,workspace_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session ON voice_sessions(workspace_id) WHERE state IN ('reserved','active');
CREATE TABLE IF NOT EXISTS usage_ledger (
 session_id uuid PRIMARY KEY, month text NOT NULL, reserved_seconds integer NOT NULL CHECK(reserved_seconds>=0),
 actual_seconds integer, estimated_gbp numeric NOT NULL, settled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS worker_events (
 id text PRIMARY KEY, session_id uuid NOT NULL REFERENCES voice_sessions ON DELETE CASCADE,
 kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transcript_turns (
 id text NOT NULL, session_id uuid NOT NULL REFERENCES voice_sessions ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')), text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,id)
);
CREATE TABLE IF NOT EXISTS demo_bookings (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE, session_id uuid NOT NULL,
 service_id text NOT NULL, service_name text NOT NULL, customer text NOT NULL, contact text NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, timezone text NOT NULL,
 status text NOT NULL CHECK(status IN ('confirmed','cancelled')), reference text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at), FOREIGN KEY(session_id,workspace_id) REFERENCES voice_sessions(id,workspace_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS booking_calendar ON demo_bookings(workspace_id,starts_at,ends_at) WHERE status='confirmed';
-- All booking mutations acquire the workspace row lock before conflict detection and insertion.
CREATE TABLE IF NOT EXISTS action_events (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE, session_id uuid NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL, name text NOT NULL, status text NOT NULL CHECK(status IN ('success','error')),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,idempotency_key),
 FOREIGN KEY(session_id,workspace_id) REFERENCES voice_sessions(id,workspace_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS customer_records (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE, session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('enquiry','callback','staff_follow_up','appointment_request')),
 customer text NOT NULL, contact text NOT NULL, details text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,workspace_id) REFERENCES voice_sessions(id,workspace_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS confirmation_previews (
 id uuid PRIMARY KEY, action_id uuid NOT NULL REFERENCES action_events ON DELETE CASCADE, channel text NOT NULL CHECK(channel IN ('email','sms')),
 body text NOT NULL, status text NOT NULL DEFAULT 'Preview only — not sent' CHECK(status='Preview only — not sent')
);
CREATE TABLE IF NOT EXISTS feedback (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE, session_id uuid,
 configuration_version integer, voice text NOT NULL, category text NOT NULL, problems jsonb NOT NULL,
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,workspace_id) REFERENCES voice_sessions(id,workspace_id) ON DELETE SET NULL (session_id)
);
CREATE TABLE IF NOT EXISTS connections (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces ON DELETE CASCADE, data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pilot_requests (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE, email text NOT NULL,
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_resets (
 id uuid PRIMARY KEY, actor text NOT NULL, email_hash text NOT NULL, previous_session uuid,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS voice_previews (cache_key text PRIMARY KEY, audio bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001') ON CONFLICT DO NOTHING;
