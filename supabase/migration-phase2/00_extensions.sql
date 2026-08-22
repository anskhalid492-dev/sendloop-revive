-- MunchReach migration Phase 2 — step 0
-- Run FIRST on the NEW project, as the postgres/superuser role.
-- Safe to re-run.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Supabase installs pgcrypto / uuid-ossp into the "extensions" schema.
-- Several MunchReach functions call extensions.gen_random_bytes(), so the
-- schema placement matters, not just the extension being present.
CREATE EXTENSION IF NOT EXISTS pgcrypto     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
-- pg_cron must live in its own schema and only installs on the postgres database.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Availability check
SELECT extname, extversion, n.nspname AS schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE extname IN ('pgcrypto', 'uuid-ossp', 'pg_net', 'pg_cron', 'supabase_vault')
ORDER BY extname;
