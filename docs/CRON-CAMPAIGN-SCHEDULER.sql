-- MunchReach — register the production campaign scheduler cron job.
--
-- Run this ONCE in the SQL editor of the PRODUCTION project used by the app:
--   rihgzkofoxcjljlbvbya   (NOT <OLD_PROJECT_ID>)
--
-- It does NOT create a second scheduler or a second sending path: it only
-- invokes the existing public.run_campaign_scheduler(), which POSTs to
-- /api/public/cron/run-campaigns with the URL + token already stored in
-- platform_settings.campaign_runner. No secret appears in this file.
--
-- Safe to re-run: the job is unscheduled first if it already exists.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'munchreach-campaign-runner';

-- Every minute: an open sending window is picked up on the next tick, so a
-- campaign never waits for the next day and never needs a manual Run click.
select cron.schedule(
  'munchreach-campaign-runner',
  '* * * * *',
  $$select public.run_campaign_scheduler();$$
);

-- 1) Verify registration
select jobid, jobname, schedule, active, command
from cron.job
where jobname ilike '%campaign%'
   or command ilike '%campaign_scheduler%'
   or command ilike '%run-campaigns%';

-- 2) Verify executions (use the jobid from step 1)
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'munchreach-campaign-runner')
order by start_time desc
limit 20;
