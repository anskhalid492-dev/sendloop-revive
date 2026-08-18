GRANT sandbox_exec TO postgres WITH INHERIT TRUE, SET TRUE;
SET ROLE sandbox_exec;

-- 1. Customer-owned sending domains
CREATE TABLE IF NOT EXISTS public.sending_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  registrar text,
  dkim_selector text NOT NULL,
  tracking_host text,
  dns_status text NOT NULL DEFAULT 'pending',
  spf_status text NOT NULL DEFAULT 'pending',
  dkim_status text NOT NULL DEFAULT 'pending',
  dmarc_status text NOT NULL DEFAULT 'pending',
  mx_status text NOT NULL DEFAULT 'pending',
  tracking_status text NOT NULL DEFAULT 'pending',
  last_checked_at timestamptz,
  verified_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sending_domains_workspace_domain_key
  ON public.sending_domains (workspace_id, lower(domain));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sending_domains TO authenticated;
GRANT ALL ON public.sending_domains TO service_role;
ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sending_domains_select ON public.sending_domains;
CREATE POLICY sending_domains_select ON public.sending_domains
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS sending_domains_insert ON public.sending_domains;
CREATE POLICY sending_domains_insert ON public.sending_domains
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

DROP POLICY IF EXISTS sending_domains_update ON public.sending_domains;
CREATE POLICY sending_domains_update ON public.sending_domains
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

DROP POLICY IF EXISTS sending_domains_delete ON public.sending_domains;
CREATE POLICY sending_domains_delete ON public.sending_domains
  FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS sending_domains_admin_all ON public.sending_domains;
CREATE POLICY sending_domains_admin_all ON public.sending_domains
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS sending_domains_set_updated_at ON public.sending_domains;
CREATE TRIGGER sending_domains_set_updated_at
  BEFORE UPDATE ON public.sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Link mailboxes to the customer's own domain
ALTER TABLE public.sending_accounts
  ADD COLUMN IF NOT EXISTS domain_id uuid REFERENCES public.sending_domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connection_method text,
  ADD COLUMN IF NOT EXISTS auth_status text NOT NULL DEFAULT 'untested';

CREATE INDEX IF NOT EXISTS sending_accounts_domain_id_idx ON public.sending_accounts (domain_id);

-- 3. Customers manage their own mailboxes (workspace-scoped write access)
DROP POLICY IF EXISTS sending_accounts_insert ON public.sending_accounts;
CREATE POLICY sending_accounts_insert ON public.sending_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

DROP POLICY IF EXISTS sending_accounts_update ON public.sending_accounts;
CREATE POLICY sending_accounts_update ON public.sending_accounts
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

DROP POLICY IF EXISTS sending_accounts_delete ON public.sending_accounts;
CREATE POLICY sending_accounts_delete ON public.sending_accounts
  FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

-- 4. Retire the Sendloop-provisioned mailbox request system
DROP FUNCTION IF EXISTS public.request_sending_account_release(uuid[], text);
DROP TABLE IF EXISTS public.sending_account_requests;

RESET ROLE;