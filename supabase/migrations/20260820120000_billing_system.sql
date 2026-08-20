-- ===== Billing system =====
do $$ begin
  create type public.billing_provider as enum ('stripe','paddle','lemonsqueezy');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.billing_environment as enum ('test','live');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.billing_sub_status as enum ('trialing','active','past_due','payment_failed','paused','cancelled','expired');
exception when duplicate_object then null; end $$;

-- Provider configuration (no secrets stored here; secrets live in env)
create table if not exists public.billing_providers (
  id uuid primary key default gen_random_uuid(),
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  is_enabled boolean not null default false,
  public_config jsonb not null default '{}'::jsonb,
  last_payment_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment)
);
grant select on public.billing_providers to authenticated;
grant all on public.billing_providers to service_role;
alter table public.billing_providers enable row level security;
create policy "billing_providers admin manage" on public.billing_providers
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "billing_providers readable" on public.billing_providers
  for select to authenticated using (true);

insert into public.billing_providers (provider, environment)
select p, e from unnest(enum_range(null::public.billing_provider)) p
cross join unnest(enum_range(null::public.billing_environment)) e
on conflict do nothing;

-- Provider-specific price identifiers per plan
create table if not exists public.billing_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  billing_interval public.billing_interval not null,
  external_price_id text not null,
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, provider, environment, billing_interval)
);
grant select on public.billing_plan_prices to authenticated;
grant all on public.billing_plan_prices to service_role;
alter table public.billing_plan_prices enable row level security;
create policy "billing_plan_prices admin manage" on public.billing_plan_prices
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "billing_plan_prices readable" on public.billing_plan_prices
  for select to authenticated using (true);

-- Provider customers per workspace
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  external_customer_id text not null,
  email text,
  created_at timestamptz not null default now(),
  unique (provider, environment, external_customer_id),
  unique (workspace_id, provider, environment)
);
grant select on public.billing_customers to authenticated;
grant all on public.billing_customers to service_role;
alter table public.billing_customers enable row level security;
create policy "billing_customers member read" on public.billing_customers
  for select to authenticated using (public.is_workspace_member(workspace_id, auth.uid()) or public.has_role(auth.uid(),'admin'));

-- Normalized subscriptions
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  external_subscription_id text not null,
  external_customer_id text,
  status public.billing_sub_status not null default 'active',
  billing_interval public.billing_interval not null default 'monthly',
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  access_until timestamptz,
  grace_until timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, external_subscription_id)
);
create index if not exists billing_subscriptions_ws_idx on public.billing_subscriptions(workspace_id);
grant select on public.billing_subscriptions to authenticated;
grant all on public.billing_subscriptions to service_role;
alter table public.billing_subscriptions enable row level security;
create policy "billing_subscriptions member read" on public.billing_subscriptions
  for select to authenticated using (public.is_workspace_member(workspace_id, auth.uid()) or public.has_role(auth.uid(),'admin'));

-- Transactions (payments, refunds)
create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  external_transaction_id text not null,
  provider_event_id text,
  kind text not null default 'payment',
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'succeeded',
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, environment, external_transaction_id, kind)
);
create index if not exists billing_transactions_ws_idx on public.billing_transactions(workspace_id, occurred_at desc);
grant select on public.billing_transactions to authenticated;
grant all on public.billing_transactions to service_role;
alter table public.billing_transactions enable row level security;
create policy "billing_transactions member read" on public.billing_transactions
  for select to authenticated using ((workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())) or public.has_role(auth.uid(),'admin'));

-- Invoices
create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  external_invoice_id text not null,
  number text,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'paid',
  hosted_url text,
  pdf_url text,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, environment, external_invoice_id)
);
create index if not exists billing_invoices_ws_idx on public.billing_invoices(workspace_id, issued_at desc);
grant select on public.billing_invoices to authenticated;
grant all on public.billing_invoices to service_role;
alter table public.billing_invoices enable row level security;
create policy "billing_invoices member read" on public.billing_invoices
  for select to authenticated using ((workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())) or public.has_role(auth.uid(),'admin'));

-- Webhook events (idempotency + log)
create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.billing_provider not null,
  environment public.billing_environment not null,
  event_id text not null,
  event_type text,
  signature_ok boolean not null default false,
  status text not null default 'received',
  http_status integer,
  retry_count integer not null default 0,
  error text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, environment, event_id)
);
create index if not exists billing_webhook_events_recent_idx on public.billing_webhook_events(received_at desc);
grant select on public.billing_webhook_events to authenticated;
grant all on public.billing_webhook_events to service_role;
alter table public.billing_webhook_events enable row level security;
create policy "billing_webhook_events admin read" on public.billing_webhook_events
  for select to authenticated using (public.has_role(auth.uid(),'admin'));

-- Audit log
create table if not exists public.billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid,
  provider public.billing_provider,
  environment public.billing_environment,
  event_id text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists billing_audit_log_recent_idx on public.billing_audit_log(created_at desc);
grant select on public.billing_audit_log to authenticated;
grant all on public.billing_audit_log to service_role;
alter table public.billing_audit_log enable row level security;
create policy "billing_audit_log read" on public.billing_audit_log
  for select to authenticated using ((workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid())) or public.has_role(auth.uid(),'admin'));

drop trigger if exists billing_providers_touch on public.billing_providers;
create trigger billing_providers_touch before update on public.billing_providers
  for each row execute function public.set_updated_at();
drop trigger if exists billing_subscriptions_touch on public.billing_subscriptions;
create trigger billing_subscriptions_touch before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();
drop trigger if exists billing_plan_prices_touch on public.billing_plan_prices;
create trigger billing_plan_prices_touch before update on public.billing_plan_prices
  for each row execute function public.set_updated_at();
