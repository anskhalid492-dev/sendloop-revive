CREATE TYPE public.sending_provider AS ENUM ('smtp','ses','sendgrid','mailgun','postmark','resend','zeptomail');
CREATE TYPE public.connection_status AS ENUM ('untested','verified','failed','disabled');

CREATE TABLE public.sending_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider public.sending_provider NOT NULL,
  label text NOT NULL,
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  daily_limit integer NOT NULL DEFAULT 50 CHECK (daily_limit > 0 AND daily_limit <= 5000),
  status public.connection_status NOT NULL DEFAULT 'untested',
  last_tested_at timestamptz,
  last_error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sending_accounts_workspace_idx ON public.sending_accounts(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sending_accounts TO authenticated;
GRANT ALL ON public.sending_accounts TO service_role;
ALTER TABLE public.sending_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sending_accounts_select ON public.sending_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY sending_accounts_insert ON public.sending_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY sending_accounts_update ON public.sending_accounts FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY sending_accounts_delete ON public.sending_accounts FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER sending_accounts_updated_at BEFORE UPDATE ON public.sending_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Encrypted provider credentials: never readable from the browser.
CREATE TABLE public.sending_account_secrets (
  sending_account_id uuid PRIMARY KEY REFERENCES public.sending_accounts(id) ON DELETE CASCADE,
  credentials_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sending_account_secrets TO service_role;
ALTER TABLE public.sending_account_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_lists_workspace_idx ON public.lead_lists(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_lists TO authenticated;
GRANT ALL ON public.lead_lists TO service_role;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_lists_select ON public.lead_lists FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY lead_lists_insert ON public.lead_lists FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY lead_lists_update ON public.lead_lists FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY lead_lists_delete ON public.lead_lists FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER lead_lists_updated_at BEFORE UPDATE ON public.lead_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  list_id uuid REFERENCES public.lead_lists(id) ON DELETE SET NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  company text,
  job_title text,
  phone text,
  website text,
  country text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
CREATE INDEX leads_workspace_idx ON public.leads(workspace_id);
CREATE INDEX leads_list_idx ON public.leads(list_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();