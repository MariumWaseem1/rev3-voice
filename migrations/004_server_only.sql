-- All application access goes through the authenticated server, never Supabase REST.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['schema_migrations','control','users','auth_sessions','workspaces','entitlements','configurations','voice_sessions','usage_ledger','worker_events','transcript_turns','demo_bookings','action_events','customer_records','confirmation_previews','feedback','connections','pilot_requests','admin_resets','rate_limits','voice_previews','demo_resources']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM %I',table_name,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('004') ON CONFLICT DO NOTHING;
