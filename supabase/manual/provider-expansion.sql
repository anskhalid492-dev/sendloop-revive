-- MunchReach — provider expansion (Nuntly, Elastic Email, Maileroo, Courier, uSpeedo)
--
-- Run this ONCE against the production database before deploying the build that
-- adds these providers. It only widens the `sending_provider` enum; it creates
-- no table, changes no row and drops nothing.
--
-- Safe to re-run: every ADD VALUE is guarded.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'sending_provider' AND e.enumlabel = 'nuntly') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'nuntly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'sending_provider' AND e.enumlabel = 'elasticemail') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'elasticemail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'sending_provider' AND e.enumlabel = 'maileroo') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'maileroo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'sending_provider' AND e.enumlabel = 'courier') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'courier';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'sending_provider' AND e.enumlabel = 'uspeedo') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'uspeedo';
  END IF;
END
$$;

-- Verify:
-- SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--  WHERE t.typname = 'sending_provider' ORDER BY e.enumsortorder;
