-- 1. Automation webhook credentials: column-level lockdown.
REVOKE SELECT, INSERT, UPDATE ON public.automations FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.automations FROM anon;

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'automations'
    AND column_name NOT IN ('webhook_secret', 'webhook_token');

  EXECUTE format('GRANT SELECT (%s) ON public.automations TO authenticated', cols);
  EXECUTE format('GRANT INSERT (%s) ON public.automations TO authenticated', cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.automations TO authenticated', cols);
END $$;

GRANT ALL ON public.automations TO service_role;

-- 2. SECURITY DEFINER functions no longer callable by anon.
REVOKE EXECUTE ON FUNCTION public.public_auth_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.public_platform_config() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.public_platform_flags() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.public_review_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_program_public() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.public_auth_settings() TO service_role;
GRANT EXECUTE ON FUNCTION public.public_platform_config() TO service_role;
GRANT EXECUTE ON FUNCTION public.public_platform_flags() TO service_role;
GRANT EXECUTE ON FUNCTION public.public_review_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.referral_program_public() TO service_role;

-- 3. Admin permission probe is server-side only.
REVOKE EXECUTE ON FUNCTION public.has_admin_permission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(uuid, text) TO service_role;