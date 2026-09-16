CREATE TABLE IF NOT EXISTS public.email_click_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  campaign_id uuid,
  lead_id uuid,
  message_kind text NOT NULL DEFAULT 'campaign',
  message_id uuid,
  recipient_email text,
  url text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_click_events TO authenticated;
GRANT ALL ON public.email_click_events TO service_role;

ALTER TABLE public.email_click_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_click_events'
      AND policyname = 'Workspace members can view click events'
  ) THEN
    CREATE POLICY "Workspace members can view click events"
      ON public.email_click_events
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members m
          WHERE m.workspace_id = email_click_events.workspace_id
            AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_click_events_campaign_idx
  ON public.email_click_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_click_events_workspace_idx
  ON public.email_click_events (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_click_events_message_idx
  ON public.email_click_events (message_id);
CREATE INDEX IF NOT EXISTS email_click_events_lead_idx
  ON public.email_click_events (lead_id);