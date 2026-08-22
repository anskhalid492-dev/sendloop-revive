-- MunchReach migration Phase 2 — step 4: RLS posture check (structure only, no data).
-- Run on the NEW project after 01_public_schema.sql.

-- A. Every public table must have RLS enabled. Expect 0 rows.
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;

-- B. Every public table must have at least one policy OR be intentionally
--    locked (secrets tables are reachable only through the service role).
SELECT c.relname AS table_with_zero_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
ORDER BY 1;

-- C. No policy may be unconditionally permissive to anon/authenticated.
--    Expect 0 rows other than deliberately public marketing/content tables.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND coalesce(qual, 'true') = 'true'
  AND cmd IN ('ALL', 'SELECT', 'UPDATE', 'DELETE')
  AND roles && ARRAY['anon', 'authenticated']::name[]
ORDER BY tablename, policyname;

-- D. Security-definer routines must not be executable by anon/authenticated
--    unless production grants it. Compare this list OLD vs NEW.
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.proacl::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 1;

-- E. Workspace-scoped tables must reference the workspace isolation helpers.
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual ILIKE '%is_workspace_member%' OR qual ILIKE '%has_workspace_role%'
       OR with_check ILIKE '%is_workspace_member%' OR with_check ILIKE '%has_workspace_role%')
GROUP BY 1
ORDER BY 1;
