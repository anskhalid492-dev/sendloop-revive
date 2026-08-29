-- ============================================================
-- Public API v1 foundation
-- ============================================================

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  rate_limit_per_minute integer NOT NULL DEFAULT 120,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_workspace_idx ON public.api_keys(workspace_id);
CREATE INDEX api_keys_prefix_idx ON public.api_keys(prefix);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_members" ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "api_keys_manage_admins" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER api_keys_set_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Rate limiting counters (fixed one-minute buckets per key)
-- ------------------------------------------------------------
CREATE TABLE public.api_rate_counters (
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);

GRANT SELECT ON public.api_rate_counters TO authenticated;
GRANT ALL ON public.api_rate_counters TO service_role;
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_rate_counters_select_members" ON public.api_rate_counters
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_keys k
    WHERE k.id = api_rate_counters.api_key_id
      AND public.is_workspace_member(k.workspace_id, auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(
  _api_key_id uuid,
  _window_start timestamptz,
  _limit integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  INSERT INTO public.api_rate_counters(api_key_id, window_start, request_count)
  VALUES (_api_key_id, _window_start, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.api_rate_counters.request_count + 1
  RETURNING request_count INTO _count;

  DELETE FROM public.api_rate_counters
  WHERE api_key_id = _api_key_id AND window_start < _window_start - interval '10 minutes';

  RETURN _count;
END;
$$;

-- ------------------------------------------------------------
-- Idempotency
-- ------------------------------------------------------------
CREATE TABLE public.api_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  endpoint text NOT NULL,
  request_fingerprint text NOT NULL,
  status_code integer,
  response_body jsonb,
  state text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, endpoint, idempotency_key)
);
CREATE INDEX api_idempotency_created_idx ON public.api_idempotency_keys(created_at);

GRANT SELECT ON public.api_idempotency_keys TO authenticated;
GRANT ALL ON public.api_idempotency_keys TO service_role;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_idempotency_select_members" ON public.api_idempotency_keys
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER api_idempotency_set_updated_at
  BEFORE UPDATE ON public.api_idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Async export / import jobs
-- ------------------------------------------------------------
CREATE TABLE public.api_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress integer NOT NULL DEFAULT 0,
  total integer,
  result jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_jobs_workspace_idx ON public.api_jobs(workspace_id, created_at DESC);
CREATE INDEX api_jobs_status_idx ON public.api_jobs(status);

GRANT SELECT ON public.api_jobs TO authenticated;
GRANT ALL ON public.api_jobs TO service_role;
ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_jobs_select_members" ON public.api_jobs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER api_jobs_set_updated_at
  BEFORE UPDATE ON public.api_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Webhooks
-- ------------------------------------------------------------
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url text NOT NULL,
  description text,
  events text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  secret_hash text NOT NULL,
  secret_ciphertext text,
  created_by uuid,
  last_delivery_at timestamptz,
  last_delivery_status text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_workspace_idx ON public.webhook_endpoints(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_endpoints_select_members" ON public.webhook_endpoints
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "webhook_endpoints_manage_admins" ON public.webhook_endpoints
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER webhook_endpoints_set_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  response_status integer,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON public.webhook_deliveries(status, next_attempt_at);
CREATE INDEX webhook_deliveries_workspace_idx ON public.webhook_deliveries(workspace_id, created_at DESC);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_select_members" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER webhook_deliveries_set_updated_at
  BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();