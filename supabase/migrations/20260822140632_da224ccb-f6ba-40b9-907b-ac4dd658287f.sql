CREATE TABLE public.plan_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  granted_by uuid,
  revoked_by uuid,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_grants_status_check CHECK (status IN ('active','revoked','expired'))
);

GRANT SELECT ON public.plan_grants TO authenticated;
GRANT ALL ON public.plan_grants TO service_role;

ALTER TABLE public.plan_grants ENABLE ROW LEVEL SECURITY;

-- Members can see the grant on their own workspace (read-only, no internal note exposure happens in app code).
CREATE POLICY "Members read own workspace grants"
ON public.plan_grants FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX plan_grants_workspace_idx ON public.plan_grants (workspace_id, status);

CREATE TRIGGER plan_grants_set_updated_at
BEFORE UPDATE ON public.plan_grants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();