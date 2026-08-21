alter table public.email_providers
  add column if not exists mode text not null default 'live',
  add column if not exists region text,
  add column if not exists health_status text not null default 'unknown',
  add column if not exists health_checked_at timestamptz,
  add column if not exists health_detail text,
  add column if not exists last_success_at timestamptz,
  add column if not exists success_count integer not null default 0,
  add column if not exists failure_count integer not null default 0,
  add column if not exists sent_hour integer not null default 0,
  add column if not exists sent_day integer not null default 0,
  add column if not exists usage_hour timestamptz,
  add column if not exists usage_day date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_providers_mode_check') then
    alter table public.email_providers
      add constraint email_providers_mode_check check (mode in ('sandbox', 'live'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_providers_health_check') then
    alter table public.email_providers
      add constraint email_providers_health_check
      check (health_status in ('healthy', 'degraded', 'down', 'unknown'));
  end if;
end
$$;

alter table public.sending_domains
  add column if not exists provider_locked_until timestamptz,
  add column if not exists provider_assigned_at timestamptz;

create table if not exists public.provider_routing_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.email_providers(id) on delete set null,
  previous_provider_id uuid references public.email_providers(id) on delete set null,
  domain_id uuid references public.sending_domains(id) on delete set null,
  domain text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  event text not null,
  reason text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists provider_routing_events_created_idx
  on public.provider_routing_events (created_at desc);
create index if not exists provider_routing_events_provider_idx
  on public.provider_routing_events (provider_id, created_at desc);

grant select on public.provider_routing_events to authenticated;
grant all on public.provider_routing_events to service_role;
alter table public.provider_routing_events enable row level security;

drop policy if exists provider_routing_events_admin_read on public.provider_routing_events;
create policy provider_routing_events_admin_read on public.provider_routing_events
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.provider_record_usage(
  _provider_id uuid,
  _sent integer default 0,
  _failed integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _hour timestamptz := date_trunc('hour', now());
  _day date := (now() at time zone 'utc')::date;
begin
  update public.email_providers
     set sent_hour = case when usage_hour is distinct from _hour then 0 else sent_hour end + greatest(_sent, 0),
         sent_day = case when usage_day is distinct from _day then 0 else sent_day end + greatest(_sent, 0),
         usage_hour = _hour,
         usage_day = _day,
         success_count = success_count + greatest(_sent, 0),
         failure_count = failure_count + greatest(_failed, 0),
         last_success_at = case when _sent > 0 then now() else last_success_at end
   where id = _provider_id;
end;
$$;

revoke all on function public.provider_record_usage(uuid, integer, integer) from public;
grant execute on function public.provider_record_usage(uuid, integer, integer) to service_role;