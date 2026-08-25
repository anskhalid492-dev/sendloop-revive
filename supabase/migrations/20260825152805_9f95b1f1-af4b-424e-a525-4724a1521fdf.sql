CREATE INDEX IF NOT EXISTS conversation_messages_message_id_idx
  ON public.conversation_messages (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_engagement_events_campaign_event_idx
  ON public.email_engagement_events (campaign_id, event_type, occurred_at DESC)
  WHERE campaign_id IS NOT NULL;