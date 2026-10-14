CREATE TABLE IF NOT EXISTS booking_slots (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
 service_id text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 CHECK(ends_at>starts_at), UNIQUE(workspace_id,service_id,starts_at)
);
CREATE TABLE IF NOT EXISTS booking_emails (
 id uuid PRIMARY KEY, action_id uuid NOT NULL REFERENCES action_events ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
 recipient text NOT NULL, recipient_role text NOT NULL CHECK(recipient_role IN ('caller','owner')),
 subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(action_id,recipient_role)
);
ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_emails ENABLE ROW LEVEL SECURITY;
