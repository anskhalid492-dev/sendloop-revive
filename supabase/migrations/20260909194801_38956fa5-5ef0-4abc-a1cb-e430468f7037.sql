DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'sending_provider' AND e.enumlabel = 'nuntly') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'nuntly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'sending_provider' AND e.enumlabel = 'elasticemail') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'elasticemail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'sending_provider' AND e.enumlabel = 'maileroo') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'maileroo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'sending_provider' AND e.enumlabel = 'courier') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'courier';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'sending_provider' AND e.enumlabel = 'uspeedo') THEN
    ALTER TYPE public.sending_provider ADD VALUE 'uspeedo';
  END IF;
END
$$;