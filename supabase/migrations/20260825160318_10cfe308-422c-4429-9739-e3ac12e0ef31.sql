ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS message_id text;

CREATE INDEX IF NOT EXISTS campaign_messages_message_id_idx
  ON public.campaign_messages (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversation_messages_provider_message_id_idx
  ON public.conversation_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;