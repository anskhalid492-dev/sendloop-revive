# Phase 7 — Cron migration to the new backend

The 11 runner functions already exist on the new project and were tested
successfully (they read their URL + token from `platform_settings`, which now
points at `https://munchreach.com/api/public/cron/*`).

The only remaining step is registering the schedules, which requires SQL access
to the new project (the agent has REST/service-role access only).

## 1. Run on the NEW project (SQL editor)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('sendloop-campaign-runner',              '*/5 * * * *', $$select public.run_campaign_scheduler();$$);
select cron.schedule('sendloop-inbound-retry',                '*/10 * * * *', $$select public.run_inbound_retry();$$);
select cron.schedule('sendloop-warmup-runner',                '*/5 * * * *', $$select public.run_warmup_runner();$$);
select cron.schedule('sendloop-automation-runner',            '* * * * *',   $$select public.run_automation_runner();$$);
select cron.schedule('munchreach-transactional-email-runner', '* * * * *',   $$select public.run_transactional_email_runner();$$);
select cron.schedule('munchreach-ai-personalization-runner',  '* * * * *',   $$select public.run_ai_personalization_runner();$$);
select cron.schedule('munchreach-domain-recheck-runner',      '*/5 * * * *', $$select public.run_domain_recheck_runner();$$);
select cron.schedule('munchreach-provider-health-runner',     '*/10 * * * *', $$select public.run_provider_health_runner();$$);
select cron.schedule('munchreach-delivery-reconcile',         '*/5 * * * *', $$select public.run_delivery_reconcile_runner();$$);
select cron.schedule('lead-retention-cleanup-daily',          '15 3 * * *',  $$select public.run_lead_retention_cleanup(500, 40);$$);
select cron.schedule('publish-due-blog-posts',                '*/5 * * * *', $$select public.publish_due_blog_posts();$$);

select jobname, schedule, active from cron.job order by jobid;
```

## 2. Immediately after, disable the OLD project's jobs

The old project's 11 jobs still call the same live application, so leaving both
sets enabled would double-execute every runner. On the OLD project run:

```sql
select cron.unschedule(jobname) from cron.job;
select count(*) from cron.job; -- expect 0
```

Do not delete anything else on the old project — it stays as rollback.
