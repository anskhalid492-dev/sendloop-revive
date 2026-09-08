DROP INDEX IF EXISTS public.campaign_messages_recipient_step_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_messages_recipient_step_uniq
  ON public.campaign_messages (campaign_id, recipient_id, step_order);