-- Mailbox domain authentication checks (additive, re-runnable).
--
-- Customers connect their own mailboxes, so MunchReach checks what THEIR domain
-- publishes (SPF / DKIM / DMARC) from public DNS and stores the verdict on the
-- mailbox row. Nothing here is destructive: only new columns and one index.

alter table public.mailboxes
  add column if not exists auth_status text,
  add column if not exists auth_reason text,
  add column if not exists spf_status text,
  add column if not exists dkim_status text,
  add column if not exists dkim_selector_found text,
  add column if not exists dmarc_status text,
  add column if not exists dmarc_policy text,
  add column if not exists mail_host text,
  add column if not exists provider_daily_ceiling integer,
  add column if not exists auth_detail jsonb not null default '{}'::jsonb,
  add column if not exists auth_checked_at timestamptz;

-- The re-check runner picks the oldest-checked mailboxes first.
create index if not exists mailboxes_auth_checked_at_idx
  on public.mailboxes (auth_checked_at nulls first);

comment on column public.mailboxes.auth_status is
  'pass | warn | fail | unchecked — verdict from the last public DNS check of this mailbox''s own domain.';
comment on column public.mailboxes.provider_daily_ceiling is
  'Highest daily volume MunchReach will drive through the detected mail host. Only ever lowers the customer''s own limit.';
