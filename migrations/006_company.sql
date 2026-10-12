CREATE TABLE IF NOT EXISTS company_enquiries (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('studio','service','contact')),
 name text NOT NULL, business text NOT NULL, email text NOT NULL, category text NOT NULL, enquiry text NOT NULL,
 mail_status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studio_invitations (
 id uuid PRIMARY KEY, email text NOT NULL, token_hash text UNIQUE NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 redeemed_at timestamptz, revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS studio_members (
 email text PRIMARY KEY, approved_by text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE company_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_members ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_migrations(version) VALUES('006') ON CONFLICT DO NOTHING;
