-- 1. Inbound / delivery event log (admin only)
CREATE TABLE public.email_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'unknown',
  event_type text not null default 'inbound',
  external_id text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  sending_account_id uuid references public.sending_accounts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id text,
  from_email text,
  to_email text,
  subject text,
  status text not null default 'pending',
  attempts integer not null default 0,
  error text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE UNIQUE INDEX email_events_external_id_key ON public.email_events (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX email_events_created_idx ON public.email_events (created_at DESC);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read email events" ON public.email_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER email_events_updated_at BEFORE UPDATE ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Inbox drafts
CREATE TABLE public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  sending_account_id uuid references public.sending_accounts(id) on delete set null,
  to_email text not null default '',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  subject text not null default '',
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX email_drafts_ws_idx ON public.email_drafts (workspace_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage their drafts" ON public.email_drafts FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER email_drafts_updated_at BEFORE UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Message delivery tracking + bcc
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS bcc_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivery_detail text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 4. Sent folder support
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS has_outbound boolean NOT NULL DEFAULT false;
UPDATE public.conversations c SET has_outbound = true
  WHERE EXISTS (SELECT 1 FROM public.conversation_messages m WHERE m.conversation_id = c.id AND m.direction = 'outbound');

CREATE OR REPLACE FUNCTION public.mark_conversation_outbound()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'outbound' THEN
    UPDATE public.conversations SET has_outbound = true WHERE id = NEW.conversation_id AND has_outbound = false;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER conversation_messages_outbound AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.mark_conversation_outbound();

-- 5. Scheduler: run the campaign engine every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_campaign_scheduler()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'campaign_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := '{}'::jsonb
  );
END; $$;

SELECT cron.schedule('sendloop-campaign-runner', '*/5 * * * *', $$SELECT public.run_campaign_scheduler();$$);