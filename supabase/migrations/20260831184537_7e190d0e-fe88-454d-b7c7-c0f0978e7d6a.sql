alter table public.campaigns add column if not exists pause_reason text;
alter table public.campaigns add column if not exists paused_at timestamptz;
alter table public.sending_accounts add column if not exists pause_reason text;
alter table public.sending_accounts add column if not exists paused_at timestamptz;