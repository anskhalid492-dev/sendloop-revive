-- 1. Restrict internal billing configuration to admins only.
--    All application reads of these tables happen through server-side
--    service-role code, so no customer-facing feature depends on them.
DROP POLICY IF EXISTS "billing_providers readable" ON public.billing_providers;
DROP POLICY IF EXISTS "billing_plan_prices readable" ON public.billing_plan_prices;

CREATE POLICY "billing_providers admin read"
  ON public.billing_providers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "billing_plan_prices admin read"
  ON public.billing_plan_prices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Referral program commission/payout configuration is admin-only.
--    Public-safe fields remain available through referral_program_public().
DROP POLICY IF EXISTS "Signed-in users read program settings" ON public.referral_programs;

CREATE POLICY "Admins read program settings"
  ON public.referral_programs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. SECURITY DEFINER functions: remove blanket PUBLIC execute grants and
--    grant execute explicitly only to the roles that need each function.
REVOKE EXECUTE ON FUNCTION public.public_auth_settings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.public_platform_config() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.public_platform_flags() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.public_review_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.referral_program_public() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.public_auth_settings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_platform_config() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_platform_flags() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_review_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.referral_program_public() TO anon, authenticated, service_role;

-- 4. Privileged workspace/analytics RPCs must never be callable anonymously.
REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_crm_stage(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_workspace(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_crm_stages(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_referral_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, workspace_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, workspace_role, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.move_crm_contacts(uuid[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.referral_dashboard_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_workspace_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_referral_payout(integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_workspace_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sending_account_stats(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_sending_account_enabled(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_sending_accounts_paused(uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_workspace_member_role(uuid, workspace_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_workspace_settings(uuid, text, text, text, text, text, smallint[], smallint, smallint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.workspace_team(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_crm_stage(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_workspace(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_crm_stages(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_referral_profile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, workspace_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, workspace_role, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_crm_contacts(uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.referral_dashboard_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_referral_payout(integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invitation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sending_account_stats(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_sending_account_enabled(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_sending_accounts_paused(uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_role(uuid, workspace_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_settings(uuid, text, text, text, text, text, smallint[], smallint, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_team(uuid) TO authenticated, service_role;