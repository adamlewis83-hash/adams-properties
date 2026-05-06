-- Enable Row-Level Security on every public table.
--
-- Why: Supabase exposes any table in the `public` schema via PostgREST to
-- the `anon` role by default. Without RLS, anyone with your project URL
-- and anon key can read/write those tables. Enabling RLS without any
-- policies = nothing accessible to anon (the service-role key used by
-- Prisma bypasses RLS, so the app keeps working).
--
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — safe to re-run.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE 'Enabled RLS on %', r.tablename;
  END LOOP;
END $$;

-- Verify
SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
