-- Automatic profile creation on new sign-ups (restores the old project's trigger).
-- Safe to re-run. Idempotent by design:
--   * INSERT ... ON CONFLICT (id) DO NOTHING  -> no duplicate rows, no race with
--     the app-side ensureProfile() fallback (which also checks first and upserts).
--   * Any unexpected failure is swallowed so sign-up can never be blocked by it,
--     except the deliberate "registration disabled" gate.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reg_enabled boolean;
BEGIN
  SELECT COALESCE((value ->> 'registration_enabled')::boolean, true)
    INTO reg_enabled
  FROM public.platform_settings
  WHERE key = 'system.general';

  IF reg_enabled IS NOT NULL AND reg_enabled = false THEN
    RAISE EXCEPTION 'Registration is currently disabled'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
      NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- The app-side fallback provisions the profile on first sign-in.
    RAISE WARNING 'handle_new_user: profile insert skipped (%).', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Verify:
-- select tgname, tgenabled from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
