CREATE TABLE IF NOT EXISTS public.inbound_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT 'campaign',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbound_routes_workspace_idx ON public.inbound_routes(workspace_id);
GRANT ALL ON public.inbound_routes TO service_role;
ALTER TABLE public.inbound_routes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text NOT NULL DEFAULT 'bounced',
  source text NOT NULL DEFAULT 'webhook',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
CREATE INDEX IF NOT EXISTS email_suppressions_email_idx ON public.email_suppressions(email);
GRANT SELECT ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view suppressions"
  ON public.email_suppressions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.inbound_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  to_email text NOT NULL,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  reply_to text NOT NULL,
  token text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);
GRANT ALL ON public.inbound_tests TO service_role;
ALTER TABLE public.inbound_tests ENABLE ROW LEVEL SECURITY;