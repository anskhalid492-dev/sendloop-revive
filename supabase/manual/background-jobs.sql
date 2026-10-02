-- MunchReach — PHASE B: background job queue + worker health (ADDITIVE ONLY)
--
-- Run MANUALLY in the PRODUCTION SQL editor (project rihgzkofoxcjljlbvbya).
-- Creates 2 new tables, 2 indexes, 2 functions, 2 read-only admin policies and
-- 1 new settings row. It does NOT drop, delete, truncate or alter any existing
-- table, row, policy or cron job. Safe to re-run (every step is "if not exists").
-- Nothing uses these objects until a worker is switched to 'queue' mode.

-- ============ STEP 0: PRE-CHECKS (read-only; all three must return true) ============
select
  exists (select 1 from pg_proc where proname = 'has_role' and pronamespace = 'public'::regnamespace) as has_role_exists,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='platform_settings' and column_name='key') as settings_key_exists,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='platform_settings' and column_name='value') as settings_value_exists;

-- ============ STEP 1: APPLY (run as one block) ============
begin;

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  worker text not null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  status text not null default 'queued', -- queued | running | succeeded | failed | dead
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_owner text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.background_jobs to authenticated;
grant all on public.background_jobs to service_role;
alter table public.background_jobs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='background_jobs'
                 and policyname='Admins can view background jobs') then
    create policy "Admins can view background jobs" on public.background_jobs
      for select to authenticated using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

create unique index if not exists background_jobs_idem
  on public.background_jobs (worker, idempotency_key) where idempotency_key is not null;
create index if not exists background_jobs_due
  on public.background_jobs (worker, status, next_attempt_at);

create table if not exists public.worker_health (
  worker text primary key,
  status text not null default 'idle',
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_duration_ms integer,
  current_jobs integer not null default 0,
  failure_count integer not null default 0,
  last_error text,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
grant select on public.worker_health to authenticated;
grant all on public.worker_health to service_role;
alter table public.worker_health enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='worker_health'
                 and policyname='Admins can view worker health') then
    create policy "Admins can view worker health" on public.worker_health
      for select to authenticated using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- Atomic claim: SKIP LOCKED so parallel workers never get the same job;
-- expired leases (crashed workers) are reclaimed.
create or replace function public.claim_background_jobs(_worker text, _limit integer, _lease_seconds integer)
returns setof public.background_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.background_jobs j
     set status = 'running', attempts = j.attempts + 1, started_at = now(), updated_at = now(),
         lease_until = now() + make_interval(secs => _lease_seconds), lease_owner = _worker
   where j.id in (
     select id from public.background_jobs
      where worker = _worker
        and ((status = 'queued' and next_attempt_at <= now())
             or (status = 'running' and lease_until < now()))
      order by next_attempt_at
      limit greatest(1, least(_limit, 100))
      for update skip locked)
  returning j.*;
end $$;

-- Records outcome; failures back off exponentially with jitter and are
-- dead-lettered (kept, never deleted) after max_attempts.
create or replace function public.finish_background_job(_id uuid, _ok boolean, _error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _ok then
    update public.background_jobs set status = 'succeeded', completed_at = now(),
      lease_until = null, last_error = null, updated_at = now() where id = _id;
  else
    update public.background_jobs set
      status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      next_attempt_at = now() + make_interval(secs =>
        least(3600, 30 * power(2, greatest(0, attempts - 1))) * (0.8 + random() * 0.4)),
      lease_until = null, last_error = left(_error, 1000), updated_at = now()
    where id = _id;
  end if;
end $$;

revoke all on function public.claim_background_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_background_job(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_background_jobs(text, integer, integer) to service_role;
grant execute on function public.finish_background_job(uuid, boolean, text) to service_role;

-- Every worker starts in legacy mode (current behaviour, unchanged).
insert into public.platform_settings (key, value)
values ('worker_mode', '{"campaign":"legacy","mailbox":"legacy","warmup":"legacy","inbound":"legacy","transactional":"legacy"}'::jsonb)
on conflict (key) do nothing;

commit;

-- ============ STEP 2: VERIFY (read-only) ============
select to_regclass('public.background_jobs') as jobs_table,
       to_regclass('public.worker_health')   as health_table;
select proname from pg_proc where proname in ('claim_background_jobs','finish_background_job');
select tablename, policyname from pg_policies where tablename in ('background_jobs','worker_health');
select value from public.platform_settings where key = 'worker_mode';
select jobname, schedule, active from cron.job order by jobid;  -- all 5 jobs still present, unchanged

-- ============ ROLLBACK ============
-- Not needed: the new objects are unused while worker_mode is 'legacy', and
-- leaving them in place is harmless. No destructive rollback is provided.
