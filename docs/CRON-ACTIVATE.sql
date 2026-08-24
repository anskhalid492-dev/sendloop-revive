-- MunchReach — activate the scheduled runners on the production backend.
--
-- Root cause of "scheduled campaign did not start": the runner FUNCTIONS exist
-- on the production project and work (verified: run_campaign_scheduler() sent a
-- real batch), but no pg_cron SCHEDULES were ever registered there, so nothing
-- invoked them. Campaigns only moved when someone pressed "send due now" in the
-- app. Run this once in the production SQL editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('munchreach-campaign-runner',             '*/5 * * * *',  $$select public.run_campaign_scheduler();$$);
select cron.schedule('munchreach-inbound-retry',               '*/10 * * * *', $$select public.run_inbound_retry();$$);
select cron.schedule('munchreach-warmup-runner',               '*/5 * * * *',  $$select public.run_warmup_runner();$$);
select cron.schedule('munchreach-automation-runner',           '* * * * *',    $$select public.run_automation_runner();$$);
select cron.schedule('munchreach-transactional-email-runner',  '* * * * *',    $$select public.run_transactional_email_runner();$$);
select cron.schedule('munchreach-ai-personalization-runner',   '* * * * *',    $$select public.run_ai_personalization_runner();$$);
select cron.schedule('munchreach-domain-recheck-runner',       '*/5 * * * *',  $$select public.run_domain_recheck_runner();$$);
select cron.schedule('munchreach-provider-health-runner',      '*/10 * * * *', $$select public.run_provider_health_runner();$$);
select cron.schedule('munchreach-delivery-reconcile',          '*/5 * * * *',  $$select public.run_delivery_reconcile_runner();$$);
select cron.schedule('munchreach-lead-retention-cleanup',      '15 3 * * *',   $$select public.run_lead_retention_cleanup(500, 40);$$);
select cron.schedule('munchreach-publish-due-blog-posts',      '*/5 * * * *',  $$select public.publish_due_blog_posts();$$);

-- Verify (expect 11 active rows):
select jobname, schedule, active from cron.job order by jobid;

-- Optional: recent runner executions
-- select jobid, status, start_time from cron.job_run_details order by start_time desc limit 20;
