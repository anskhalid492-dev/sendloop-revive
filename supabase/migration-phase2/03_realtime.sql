-- MunchReach migration Phase 2 — step 3: realtime publication (30 tables)
-- Publication membership is NOT part of a schema dump; this file reproduces it.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='automation_run_steps') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_run_steps;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='automation_runs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_runs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='automations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaign_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaign_recipients') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaign_replies') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_replies;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='crm_stages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_stages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_engagement_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_engagement_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_activities') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_notes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tasks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_attributions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_attributions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_clicks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_clicks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_commissions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_commissions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_fraud_flags') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_fraud_flags;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_payouts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_payouts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referral_webhook_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_webhook_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sending_accounts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sending_accounts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='support_ticket_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='warmup_daily_stats') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_daily_stats;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='warmup_health') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_health;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='warmup_jobs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_jobs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='warmup_settings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_settings;
  END IF;
END $$;

-- REPLICA IDENTITY FULL (tables that need complete UPDATE payloads)
ALTER TABLE public.automation_run_steps REPLICA IDENTITY FULL;
ALTER TABLE public.automation_runs REPLICA IDENTITY FULL;
ALTER TABLE public.automations REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_messages REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_replies REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_events REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.crm_stages REPLICA IDENTITY FULL;
ALTER TABLE public.email_engagement_events REPLICA IDENTITY FULL;
ALTER TABLE public.lead_activities REPLICA IDENTITY FULL;
ALTER TABLE public.lead_notes REPLICA IDENTITY FULL;
ALTER TABLE public.lead_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.referral_attributions REPLICA IDENTITY FULL;
ALTER TABLE public.referral_clicks REPLICA IDENTITY FULL;
ALTER TABLE public.referral_commissions REPLICA IDENTITY FULL;
ALTER TABLE public.referral_fraud_flags REPLICA IDENTITY FULL;
ALTER TABLE public.referral_payouts REPLICA IDENTITY FULL;
ALTER TABLE public.referral_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.referral_webhook_events REPLICA IDENTITY FULL;
ALTER TABLE public.sending_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.warmup_daily_stats REPLICA IDENTITY FULL;
ALTER TABLE public.warmup_health REPLICA IDENTITY FULL;
ALTER TABLE public.warmup_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.warmup_settings REPLICA IDENTITY FULL;

SELECT count(*) AS realtime_tables FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public';
