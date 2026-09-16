-- First-party open tracking storage (additive only; safe to re-run).
-- Nothing is dropped, renamed or deleted.

CREATE TABLE IF NOT EXISTS public.email_open_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  campaign_id uuid,
  lead_id uuid,
  message_kind text NOT NULL DEFAULT 'campaign',
  message_id uuid NOT NULL,
  recipient_email text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  client_ip text,
  is_prefetch boolean NOT NULL DEFAULT false,
  prefetch_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_open_events TO authenticated;
GRANT ALL ON public.email_open_events TO service_role;

ALTER TABLE public.email_open_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_open_events'
      AND policyname = 'Workspace members can view open events'
  ) THEN
    CREATE POLICY "Workspace members can view open events"
      ON public.email_open_events
      FOR SELECT TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_open_events'
      AND policyname = 'Service role manages open events'
  ) THEN
    CREATE POLICY "Service role manages open events"
      ON public.email_open_events
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_open_events_campaign_idx
  ON public.email_open_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_open_events_campaign_lead_idx
  ON public.email_open_events (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS email_open_events_message_idx
  ON public.email_open_events (message_kind, message_id);
CREATE INDEX IF NOT EXISTS email_open_events_workspace_idx
  ON public.email_open_events (workspace_id, occurred_at DESC);

ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
