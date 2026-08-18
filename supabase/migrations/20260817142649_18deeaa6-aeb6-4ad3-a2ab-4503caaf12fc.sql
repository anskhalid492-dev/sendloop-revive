-- 1. Admin-owned provider registry -------------------------------------------
create table public.email_providers (
  id uuid primary key default gen_random_uuid(),
  provider public.sending_provider not null,
  name text not null,
  is_enabled boolean not null default true,
  priority smallint not null default 100,
  daily_capacity integer not null default 1000,
  hourly_capacity integer not null default 200,
  cost_per_1k_cents integer not null default 0,
  status public.connection_status not null default 'untested',
  last_tested_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.email_providers to authenticated;
grant all on public.email_providers to service_role;
alter table public.email_providers enable row level security;

create policy email_providers_admin_all on public.email_providers
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger email_providers_updated_at before update on public.email_providers
  for each row execute function public.set_updated_at();

-- 2. Provider credentials: server-side only -----------------------------------
create table public.email_provider_secrets (
  provider_id uuid primary key references public.email_providers(id) on delete cascade,
  credentials_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.email_provider_secrets to service_role;
alter table public.email_provider_secrets enable row level security;
-- intentionally no policies: only the service role may read/write credentials

-- 3. Sending accounts become a Sendloop-owned pool assigned to workspaces -----
alter table public.sending_accounts
  alter column workspace_id drop not null,
  alter column created_by drop not null,
  add column provider_id uuid references public.email_providers(id) on delete set null,
  add column hourly_limit integer not null default 20,
  add column sent_today integer not null default 0,
  add column health_score smallint not null default 100,
  add column warmup_status text not null default 'warming',
  add column warmup_daily_target integer not null default 30,
  add column customer_enabled boolean not null default true,
  add column paused boolean not null default false,
  add column assigned_at timestamptz,
  add column admin_notes text;

-- customers may no longer create, edit or delete sending accounts
drop policy if exists sending_accounts_insert on public.sending_accounts;
drop policy if exists sending_accounts_update on public.sending_accounts;
drop policy if exists sending_accounts_delete on public.sending_accounts;

create policy sending_accounts_admin_all on public.sending_accounts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- customers toggle availability through a narrow, audited entry point
create or replace function public.set_sending_account_enabled(_account_id uuid, _enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.sending_accounts sa
    where sa.id = _account_id
      and sa.workspace_id is not null
      and public.has_workspace_role(
        sa.workspace_id, auth.uid(),
        array['owner','admin','campaign_manager']::public.workspace_role[]
      )
  ) then
    raise exception 'Not authorized for this sending account';
  end if;

  update public.sending_accounts
  set customer_enabled = _enabled, updated_at = now()
  where id = _account_id;
end;
$$;

revoke execute on function public.set_sending_account_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_sending_account_enabled(uuid, boolean) to authenticated;

-- 4. Onboarding context on workspaces -----------------------------------------
alter table public.workspaces
  add column outreach_type text,
  add column onboarding_completed boolean not null default false;