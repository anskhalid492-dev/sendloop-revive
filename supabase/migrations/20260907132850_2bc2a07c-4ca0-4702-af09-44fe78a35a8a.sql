CREATE TABLE IF NOT EXISTS public.sending_domain_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL UNIQUE REFERENCES public.sending_domains(id) ON DELETE CASCADE,
  provider_id uuid,
  provider_type text,
  provider_region text,
  tracking_enabled boolean NOT NULL DEFAULT false,
  custom_tracking_enabled boolean NOT NULL DEFAULT false,
  tracking_status text NOT NULL DEFAULT 'pending',
  tracking_hostname text,
  provider_tracking_identifier text,
  fingerprint text NOT NULL DEFAULT '',
  records jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sending_domain_tracking_workspace_idx
  ON public.sending_domain_tracking (workspace_id);

GRANT SELECT ON public.sending_domain_tracking TO authenticated;
GRANT ALL ON public.sending_domain_tracking TO service_role;

ALTER TABLE public.sending_domain_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read domain tracking" ON public.sending_domain_tracking;
CREATE POLICY "Workspace members read domain tracking"
  ON public.sending_domain_tracking
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP TRIGGER IF EXISTS set_sending_domain_tracking_updated_at ON public.sending_domain_tracking;
CREATE TRIGGER set_sending_domain_tracking_updated_at
  BEFORE UPDATE ON public.sending_domain_tracking
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();