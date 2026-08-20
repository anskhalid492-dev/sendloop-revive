-- 1. Privileged job runner must not be callable by customers or the public.
REVOKE EXECUTE ON FUNCTION public.run_automation_runner() FROM anon, authenticated, PUBLIC;

-- 2. Least privilege: internal / signed-in-only security definer helpers are not for anon.
REVOKE EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_crm_contacts(uuid[], uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_referral_payout(integer, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.referral_dashboard_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_referral_profile() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_workspace_crm_stages() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_ledger_immutable() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_workspace_invitation_activity() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_workspace_member_activity() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_support_reply() FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_crm_contacts(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_referral_payout(integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.referral_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_referral_profile() TO authenticated;

-- 3. Workspace creation: the owner of a brand new workspace has no membership row yet,
--    so the default-stage seeding trigger rejected legitimate creation. Accept the owner too.
CREATE OR REPLACE FUNCTION public.ensure_crm_stages(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_workspace_member(_workspace_id, auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.workspaces w
       WHERE w.id = _workspace_id AND w.owner_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  INSERT INTO public.crm_stages (workspace_id, key, name, color, position, is_won, is_lost)
  VALUES
    (_workspace_id, 'new',            'New',            'slate',   0, false, false),
    (_workspace_id, 'contacted',      'Contacted',      'blue',    1, false, false),
    (_workspace_id, 'replied',        'Replied',        'violet',  2, false, false),
    (_workspace_id, 'meeting_booked', 'Meeting Booked', 'amber',   3, false, false),
    (_workspace_id, 'won',            'Won',            'emerald', 4, true,  false),
    (_workspace_id, 'lost',           'Lost',           'rose',    5, false, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$function$;