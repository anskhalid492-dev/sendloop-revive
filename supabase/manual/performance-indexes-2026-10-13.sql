-- MunchReach — performance fixes (ADDITIVE ONLY). Run MANUALLY in the PRODUCTION SQL editor.
-- Creates indexes only. No drop, delete, schedule or data change. Safe to re-run.
-- Plain CREATE INDEX (SQL editor runs in a transaction); each briefly blocks writes to its table.

-- ===== STEP 0: READ-ONLY CHECKS (save the output) =====
select tablename, indexname, indexdef from pg_indexes
 where schemaname='public' and tablename in ('inbound_routes','conversation_messages','warmup_health')
 order by tablename, indexname;
select value from public.platform_settings where key = 'worker_mode';
select worker, status, count(*) from public.background_jobs group by 1,2 order by 1,2;
select jobid, jobname, schedule, active, command from cron.job order by jobid;
select count(*) as run_rows, min(start_time) as oldest,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as size
  from cron.job_run_details;
select count(*) as warmup_health_rows,
       pg_size_pretty(pg_total_relation_size('public.warmup_health')) as size
  from public.warmup_health;

-- ===== STEP 1: INDEXES =====
-- Per-send "link reply route to conversation" update (was a full table scan).
create index if not exists inbound_routes_unlinked_campaign_lead_idx
  on public.inbound_routes (campaign_id, lead_id) where conversation_id is null;
-- Per-send outbound message lookup (no-op if it already exists).
create index if not exists conversation_messages_campaign_message_id_idx
  on public.conversation_messages (campaign_message_id);
-- "Latest health per mailbox" reads.
create index if not exists warmup_health_account_computed_idx
  on public.warmup_health (sending_account_id, computed_at desc);

-- ===== STEP 2: VERIFY =====
select indexname from pg_indexes where indexname in (
  'inbound_routes_unlinked_campaign_lead_idx',
  'conversation_messages_campaign_message_id_idx',
  'warmup_health_account_computed_idx');

-- ROLLBACK (only if ever needed; removes an index, never data):
-- drop index if exists public.inbound_routes_unlinked_campaign_lead_idx;
-- drop index if exists public.warmup_health_account_computed_idx;
