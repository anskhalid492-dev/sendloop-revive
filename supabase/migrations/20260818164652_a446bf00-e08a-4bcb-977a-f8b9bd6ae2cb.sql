create table if not exists public.warmup_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sending_account_id uuid not null unique references public.sending_accounts(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'balanced' check (mode in ('conservative','balanced','aggressive')),
  start_volume smallint not null default 4 check (start_volume between 1 and 200),
  max_volume smallint not null default 40 check (max_volume between 1 and 400),
  daily_increase smallint not null default 2 check (daily_increase between 1 and 50),
  ramp_days smallint not null default 30 check (ramp_days between 3 and 120),
  send_days smallint[] not null default '{1,2,3,4,5}',
  send_start_hour smallint not null default 8 check (send_start_hour between 0 and 23),
  send_end_hour smallint not null default 18 check (send_end_hour between 1 and 24),
  timezone text not null default 'UTC',
  reply_rate smallint not null default 35 check (reply_rate between 0 and 100),
  max_bounce_rate smallint not null default 5 check (max_bounce_rate between 1 and 50),
  min_health_score smallint not null default 50 check (min_health_score between 0 and 100),
  auto_pause boolean not null default true,
  paused_by_system boolean not null default false,
  pause_reason text,
  paused_at timestamptz,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.warmup_settings to authenticated;
grant all on public.warmup_settings to service_role;
alter table public.warmup_settings enable row level security;

create policy "warmup settings readable by workspace members"
  on public.warmup_settings for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "warmup settings insertable by managers"
  on public.warmup_settings for insert to authenticated
  with check (public.has_workspace_role(workspace_id, auth.uid(),
    array['owner','admin','campaign_manager']::public.workspace_role[]));
create policy "warmup settings updatable by managers"
  on public.warmup_settings for update to authenticated
  using (public.has_workspace_role(workspace_id, auth.uid(),
    array['owner','admin','campaign_manager']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, auth.uid(),
    array['owner','admin','campaign_manager']::public.workspace_role[]));
create policy "warmup settings deletable by managers"
  on public.warmup_settings for delete to authenticated
  using (public.has_workspace_role(workspace_id, auth.uid(),
    array['owner','admin']::public.workspace_role[]));

create trigger warmup_settings_updated_at before update on public.warmup_settings
  for each row execute function public.set_updated_at();

create table if not exists public.warmup_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  recipient_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  subject text not null,
  thread_key text not null unique,
  status text not null default 'open' check (status in ('open','replied','completed','failed')),
  message_count smallint not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

grant select on public.warmup_conversations to authenticated;
grant all on public.warmup_conversations to service_role;
alter table public.warmup_conversations enable row level security;
create policy "warmup conversations readable by workspace members"
  on public.warmup_conversations for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create table if not exists public.warmup_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sending_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  conversation_id uuid references public.warmup_conversations(id) on delete set null,
  recipient_account_id uuid references public.sending_accounts(id) on delete set null,
  role text not null default 'initial' check (role in ('initial','reply','followup')),
  from_email text not null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued'
    check (status in ('queued','processing','sent','delivered','replied','failed','cancelled')),
  scheduled_at timestamptz not null default now(),
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  next_attempt_at timestamptz,
  idempotency_key text not null unique,
  provider text,
  provider_message_id text,
  locked_by text,
  locked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists warmup_jobs_due_idx
  on public.warmup_jobs (status, scheduled_at) where status = 'queued';
create index if not exists warmup_jobs_stuck_idx
  on public.warmup_jobs (status, locked_at) where status = 'processing';
create index if not exists warmup_jobs_account_idx
  on public.warmup_jobs (sending_account_id, created_at desc);
create index if not exists warmup_jobs_provider_message_idx
  on public.warmup_jobs (provider_message_id) where provider_message_id is not null;

grant select on public.warmup_jobs to authenticated;
grant all on public.warmup_jobs to service_role;
alter table public.warmup_jobs enable row level security;
create policy "warmup jobs readable by workspace members"
  on public.warmup_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create table if not exists public.warmup_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sending_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  job_id uuid references public.warmup_jobs(id) on delete set null,
  type text not null check (type in
    ('scheduled','sent','delivered','bounced','complained','failed','deferred','replied','opened','clicked')),
  detail text,
  provider text,
  provider_message_id text,
  external_id text unique,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists warmup_events_account_idx
  on public.warmup_events (sending_account_id, occurred_at desc);

grant select on public.warmup_events to authenticated;
grant all on public.warmup_events to service_role;
alter table public.warmup_events enable row level security;
create policy "warmup events readable by workspace members"
  on public.warmup_events for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create table if not exists public.warmup_daily_stats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sending_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  day date not null,
  target smallint not null default 0,
  scheduled integer not null default 0,
  sent integer not null default 0,
  delivered integer not null default 0,
  bounced integer not null default 0,
  complained integer not null default 0,
  failed integer not null default 0,
  replied integer not null default 0,
  health_score smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sending_account_id, day)
);

grant select on public.warmup_daily_stats to authenticated;
grant all on public.warmup_daily_stats to service_role;
alter table public.warmup_daily_stats enable row level security;
create policy "warmup stats readable by workspace members"
  on public.warmup_daily_stats for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger warmup_daily_stats_updated_at before update on public.warmup_daily_stats
  for each row execute function public.set_updated_at();

create table if not exists public.warmup_health (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sending_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  status text not null check (status in ('healthy','good','warning','critical','paused','error')),
  factors jsonb not null default '[]'::jsonb,
  recommendation text,
  computed_at timestamptz not null default now()
);

create index if not exists warmup_health_account_idx
  on public.warmup_health (sending_account_id, computed_at desc);

grant select on public.warmup_health to authenticated;
grant all on public.warmup_health to service_role;
alter table public.warmup_health enable row level security;
create policy "warmup health readable by workspace members"
  on public.warmup_health for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create table if not exists public.warmup_runner_state (
  id text primary key,
  lease_until timestamptz,
  lease_owner text,
  paused boolean not null default false,
  pause_reason text,
  last_run_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.warmup_runner_state to authenticated;
grant all on public.warmup_runner_state to service_role;
alter table public.warmup_runner_state enable row level security;
create policy "warmup runner state readable by admins"
  on public.warmup_runner_state for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

insert into public.warmup_runner_state (id) values ('warmup') on conflict (id) do nothing;

create table if not exists public.sending_account_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sending_account_id uuid not null references public.sending_accounts(id) on delete cascade,
  actor_id uuid,
  kind text not null check (kind in ('connect','reconnect','test','send','warmup_send')),
  ok boolean not null,
  provider text,
  status_code integer,
  message text,
  detail jsonb not null default '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists sending_account_checks_account_idx
  on public.sending_account_checks (sending_account_id, created_at desc);

grant select on public.sending_account_checks to authenticated;
grant all on public.sending_account_checks to service_role;
alter table public.sending_account_checks enable row level security;
create policy "mailbox checks readable by workspace members"
  on public.sending_account_checks for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "mailbox checks writable by workspace members"
  on public.sending_account_checks for insert to authenticated
  with check (public.is_workspace_member(workspace_id, auth.uid()));

create table if not exists public.domain_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain_id uuid not null references public.sending_domains(id) on delete cascade,
  kind text not null,
  severity text not null default 'critical' check (severity in ('critical','warning','info')),
  title text not null,
  detail text,
  records text[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists domain_alerts_open_idx
  on public.domain_alerts (domain_id, created_at desc) where resolved_at is null;

grant select, update on public.domain_alerts to authenticated;
grant all on public.domain_alerts to service_role;
alter table public.domain_alerts enable row level security;
create policy "domain alerts readable by workspace members"
  on public.domain_alerts for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "domain alerts resolvable by workspace members"
  on public.domain_alerts for update to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()))
  with check (public.is_workspace_member(workspace_id, auth.uid()));

create or replace function public.claim_warmup_jobs(_worker text, _limit integer)
returns setof public.warmup_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.warmup_jobs
  set status = 'queued', locked_by = null, locked_at = null
  where status = 'processing' and locked_at < now() - interval '10 minutes';

  return query
  with due as (
    select j.id
    from public.warmup_jobs j
    where j.status = 'queued'
      and j.scheduled_at <= now()
      and (j.next_attempt_at is null or j.next_attempt_at <= now())
    order by j.scheduled_at
    limit greatest(1, least(_limit, 100))
    for update skip locked
  )
  update public.warmup_jobs j
  set status = 'processing',
      locked_by = _worker,
      locked_at = now(),
      attempts = j.attempts + 1
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

revoke all on function public.claim_warmup_jobs(text, integer) from public;
revoke all on function public.claim_warmup_jobs(text, integer) from anon;
revoke all on function public.claim_warmup_jobs(text, integer) from authenticated;
grant execute on function public.claim_warmup_jobs(text, integer) to service_role;

alter table public.warmup_jobs replica identity full;
alter table public.warmup_daily_stats replica identity full;
alter table public.warmup_settings replica identity full;