ALTER TABLE company_enquiries ADD COLUMN IF NOT EXISTS application jsonb;
INSERT INTO schema_migrations(version) VALUES('008') ON CONFLICT DO NOTHING;
