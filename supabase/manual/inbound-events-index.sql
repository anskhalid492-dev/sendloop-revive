-- Additive, rerunnable. Speeds up the inbound reconciliation read that was
-- hitting the Postgres statement timeout on the retry-inbound tick.
create index if not exists email_events_inbound_created_at_idx
  on public.email_events (event_type, created_at desc);

create index if not exists conversation_messages_message_id_idx
  on public.conversation_messages (message_id);
