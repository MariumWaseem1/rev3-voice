ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS audio_intent_at timestamptz;
INSERT INTO schema_migrations(version) VALUES('002') ON CONFLICT DO NOTHING;
