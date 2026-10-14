-- Additive, rerunnable. Run MANUALLY in the PRODUCTION SQL editor.
-- Creates indexes only: no data, schedule or constraint changes.
-- Speeds up the inbound retry sweep (selectDueInboundEvents) and the
-- reconciliation read, both of which were hitting the statement timeout.

-- Reconciliation: latest inbound events.
create index if not exists email_events_inbound_created_at_idx
  on public.email_events (event_type, created_at desc);

-- Retry sweep: only the small set of unfinished events, oldest first.
create index if not exists email_events_retry_due_idx
  on public.email_events (created_at)
  where status in ('failed', 'retrying', 'pending');

create index if not exists conversation_messages_message_id_idx
  on public.conversation_messages (message_id);

-- VERIFY:
-- select indexname from pg_indexes where indexname in
--   ('email_events_inbound_created_at_idx','email_events_retry_due_idx','conversation_messages_message_id_idx');

-- ROLLBACK (removes an index, never data):
-- drop index if exists public.email_events_retry_due_idx;
