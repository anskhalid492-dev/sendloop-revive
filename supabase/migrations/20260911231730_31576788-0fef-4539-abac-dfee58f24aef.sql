DO $$
DECLARE
  backend_only text[] := ARRAY[
    'run_campaign_scheduler','run_automation_runner','run_warmup_runner',
    'run_ai_personalization_runner','run_transactional_email_runner',
    'run_delivery_reconcile_runner','run_domain_recheck_runner',
    'run_provider_health_runner','run_inbound_retry','run_lead_retention_cleanup',
    'claim_automation_runs','claim_warmup_jobs','claim_warmup_jobs_for_account',
    'claim_ai_personalization_jobs','repair_delivery_state','publish_due_blog_posts',
    'provider_record_usage','apply_credit_change','consume_workspace_usage',
    'consume_workspace_usage_v2','release_workspace_usage','release_workspace_usage_v2',
    'api_rate_limit_hit','admin_rate_limit_hit'
  ];
  signed_in_only text[] := ARRAY[
    'accept_workspace_invitation','invite_workspace_member','resend_workspace_invitation',
    'revoke_workspace_invitation','remove_workspace_member','update_workspace_member_role',
    'update_workspace_settings','delete_workspace','workspace_team','touch_workspace_activity',
    'analytics_summary','analytics_by_campaign','analytics_by_account','analytics_timeseries',
    'sending_account_stats','set_sending_account_enabled','set_sending_accounts_paused',
    'ensure_crm_stages','delete_crm_stage','move_crm_contacts','ensure_referral_profile',
    'referral_dashboard_stats','request_referral_payout','has_role','has_admin_permission',
    'has_workspace_role','is_workspace_member'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(backend_only)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(signed_in_only)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
