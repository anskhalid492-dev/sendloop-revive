CREATE TABLE IF NOT EXISTS public.email_open_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  campaign_id uuid NULL,
  lead_id uuid NULL,
  message_kind text NOT NULL DEFAULT 'campaign',
  message_id uuid NULL,
  recipient_email text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_agent text NULL,
  client_ip text NULL,
  is_prefetch boolean NOT NULL DEFAULT false,
  prefetch_source text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_open_events_message_kind_check CHECK (message_kind IN ('campaign', 'conversation'))
);

GRANT SELECT ON public.email_open_events TO authenticated;
GRANT ALL ON public.email_open_events TO service_role;

ALTER TABLE public.email_open_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read their open events" ON public.email_open_events;
CREATE POLICY "Workspace members read their open events"
  ON public.email_open_events
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS email_open_events_campaign_idx
  ON public.email_open_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_open_events_campaign_lead_idx
  ON public.email_open_events (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS email_open_events_message_idx
  ON public.email_open_events (message_kind, message_id);
CREATE INDEX IF NOT EXISTS email_open_events_workspace_idx
  ON public.email_open_events (workspace_id, occurred_at DESC);

ALTER TABLE public.campaign_messages ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS first_opened_at timestamptz NULL;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;