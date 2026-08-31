-- Bounce & complaint protection — run once on the production project.
--
-- Stores the reason and time whenever MunchReach automatically pauses a
-- campaign or a sending mailbox because of bounces or spam complaints.

alter table public.campaigns add column if not exists pause_reason text;
alter table public.campaigns add column if not exists paused_at timestamptz;

alter table public.sending_accounts add column if not exists pause_reason text;
alter table public.sending_accounts add column if not exists paused_at timestamptz;
