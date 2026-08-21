ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS has_inbound boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_conversation_direction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'outbound' THEN
    UPDATE public.conversations SET has_outbound = true
      WHERE id = NEW.conversation_id AND has_outbound = false;
  ELSIF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
      SET has_inbound = true,
          last_inbound_at = GREATEST(COALESCE(last_inbound_at, NEW.created_at), NEW.created_at)
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS conversation_messages_outbound ON public.conversation_messages;
CREATE TRIGGER conversation_messages_direction AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.mark_conversation_direction();

UPDATE public.conversations c
SET has_inbound = true,
    last_inbound_at = m.last_at
FROM (
  SELECT conversation_id, max(created_at) AS last_at
  FROM public.conversation_messages
  WHERE direction = 'inbound'
  GROUP BY conversation_id
) m
WHERE m.conversation_id = c.id AND (c.has_inbound = false OR c.last_inbound_at IS DISTINCT FROM m.last_at);

CREATE INDEX IF NOT EXISTS conversations_workspace_inbound_idx
  ON public.conversations (workspace_id, has_inbound, last_message_at DESC);