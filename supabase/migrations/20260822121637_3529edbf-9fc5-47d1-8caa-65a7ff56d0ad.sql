-- Authoritative outbound message classification registry
CREATE TABLE IF NOT EXISTS public.outbound_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_message_id text NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('campaign','warmup','transactional','admin_diagnostic','manual_reply')),
  provider text,
  workspace_id uuid,
  sending_account_id uuid,
  to_email text,
  ref_table text,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_messages_provider_message_id_key UNIQUE (provider_message_id)
);

CREATE INDEX IF NOT EXISTS outbound_messages_to_email_idx ON public.outbound_messages (lower(to_email), created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_messages_type_idx ON public.outbound_messages (message_type, created_at DESC);

GRANT ALL ON public.outbound_messages TO service_role;
ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read outbound message classification"
  ON public.outbound_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Mandatory classification on campaign message rows
ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'campaign';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_messages_message_type_check'
  ) THEN
    ALTER TABLE public.campaign_messages
      ADD CONSTRAINT campaign_messages_message_type_check
      CHECK (message_type IN ('campaign','transactional','manual_reply','admin_diagnostic'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS campaign_messages_message_type_idx ON public.campaign_messages (message_type);

-- Record the classification a webhook event was resolved to
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS message_type text;

-- Fast provider id lookups for warmup event reconciliation
CREATE INDEX IF NOT EXISTS warmup_jobs_provider_message_id_idx ON public.warmup_jobs (provider_message_id);