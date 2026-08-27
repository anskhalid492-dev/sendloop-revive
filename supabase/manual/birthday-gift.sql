-- Birthday Gift feature — run once on the production project (rihgzkofoxcjljlbvbya).
--
-- 1. Optional birthday on the customer profile (collected in onboarding step 3).
-- 2. One ledger row per user per year so a gift can never be granted twice.

alter table public.profiles add column if not exists birthday date;

create table if not exists public.birthday_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  gift_year integer not null,
  gift_date date not null,
  timezone text,
  email_to text,
  plan_id uuid references public.plans(id) on delete set null,
  plan_grant_id uuid references public.plan_grants(id) on delete set null,
  granted boolean not null default false,
  grant_expires_at timestamptz,
  grant_error text,
  email_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gift_year)
);

grant select on public.birthday_gifts to authenticated;
grant all on public.birthday_gifts to service_role;

alter table public.birthday_gifts enable row level security;

-- Customers may read their own gift history; everything is written by the
-- server-side runner with the service role.
create policy "Users read own birthday gifts"
  on public.birthday_gifts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins read all birthday gifts"
  on public.birthday_gifts for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create trigger birthday_gifts_updated_at
  before update on public.birthday_gifts
  for each row execute function public.set_updated_at();

create index if not exists birthday_gifts_user_idx on public.birthday_gifts (user_id, gift_year desc);
create index if not exists profiles_birthday_idx on public.profiles (birthday) where birthday is not null;
