ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS worker_claim_id text;
ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS connection_event_at timestamptz;
CREATE TABLE IF NOT EXISTS demo_resources (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
 label text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS resource_calendar ON demo_resources(workspace_id,starts_at,ends_at);
INSERT INTO schema_migrations(version) VALUES('003') ON CONFLICT DO NOTHING;
