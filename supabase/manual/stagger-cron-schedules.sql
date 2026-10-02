-- MunchReach — stagger the five existing cron jobs (PHASE D).
-- ALTERS schedules only. No job is deleted, and the commands are unchanged.
-- Run manually in the PRODUCTION SQL editor.

-- 0) Record the current schedules first (keep this output for rollback):
select jobid, jobname, schedule, active from cron.job order by jobid;

-- 1) Stagger (campaign and transactional stay every minute so sends and
--    password/signup emails are not delayed):
select cron.alter_job(jobid, schedule := '2-59/5 * * * *') from cron.job where jobname = 'sendloop-inbound-retry';
select cron.alter_job(jobid, schedule := '1-59/5 * * * *') from cron.job where jobname = 'munchreach-mailbox-poll';
select cron.alter_job(jobid, schedule := '4-59/5 * * * *') from cron.job where jobname = 'sendloop-warmup-runner';

-- 2) Verify:
select jobname, schedule, active from cron.job order by jobid;

-- ROLLBACK (previous values):
-- select cron.alter_job(jobid, schedule := '* * * * *')   from cron.job where jobname = 'sendloop-inbound-retry';
-- select cron.alter_job(jobid, schedule := '*/4 * * * *') from cron.job where jobname = 'munchreach-mailbox-poll';
-- select cron.alter_job(jobid, schedule := '*/5 * * * *') from cron.job where jobname = 'sendloop-warmup-runner';
