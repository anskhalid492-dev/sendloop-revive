-- Phase 9: system settings metadata + real enforcement of platform switches.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Public, unauthenticated read of the two switches the sign-in / marketing
-- surfaces need before a session exists. Returns booleans only.
CREATE OR REPLACE FUNCTION public.public_platform_flags()
RETURNS TABLE(maintenance_mode boolean, maintenance_message text, registration_enabled boolean, google_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT (value ->> 'maintenance_mode')::boolean FROM public.platform_settings WHERE key = 'system.maintenance'), false),
    COALESCE((SELECT value ->> 'maintenance_message' FROM public.platform_settings WHERE key = 'system.maintenance'), ''),
    COALESCE((SELECT (value ->> 'registration_enabled')::boolean FROM public.platform_settings WHERE key = 'system.general'), true),
    COALESCE((SELECT (value ->> 'google')::boolean FROM public.platform_settings WHERE key = 'auth_providers'), true);
$$;

GRANT EXECUTE ON FUNCTION public.public_platform_flags() TO anon, authenticated, service_role;

-- Registration switch is enforced at the database level, so turning it off
-- blocks account creation even if someone calls the auth API directly.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;