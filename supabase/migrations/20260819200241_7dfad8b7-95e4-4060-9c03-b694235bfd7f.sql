-- ============================ automations ============================
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  condition_logic text NOT NULL DEFAULT 'and' CHECK (condition_logic IN ('and','or')),
  version integer NOT NULL DEFAULT 1,
  webhook_token text UNIQUE,
  webhook_secret text,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automations_workspace_idx ON public.automations(workspace_id, status);
CREATE INDEX automations_trigger_idx ON public.automations(trigger_type, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automations" ON public.automations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Managers insert automations" ON public.automations FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY "Managers update automations" ON public.automations FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));
CREATE POLICY "Managers delete automations" ON public.automations FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));

CREATE TRIGGER automations_updated_at BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========================= automation_steps ==========================
CREATE TABLE public.automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('condition','action','wait','branch')),
  branch text CHECK (branch IN ('yes','no')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, position, branch)
);
CREATE INDEX automation_steps_automation_idx ON public.automation_steps(automation_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_steps TO authenticated;
GRANT ALL ON public.automation_steps TO service_role;
ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automation steps" ON public.automation_steps FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Managers write automation steps" ON public.automation_steps FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::public.workspace_role[]));

-- ========================= automation_events =========================
CREATE TABLE public.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  idempotency_key text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_automations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX automation_events_workspace_idx ON public.automation_events(workspace_id, event_type, created_at DESC);

GRANT SELECT ON public.automation_events TO authenticated;
GRANT ALL ON public.automation_events TO service_role;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automation events" ON public.automation_events FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ========================== automation_runs ==========================
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.automation_events(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  trigger_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting','completed','failed','cancelled')),
  current_step integer NOT NULL DEFAULT 0,
  branch text,
  resume_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  result text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  automation_version integer NOT NULL DEFAULT 1,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, event_id)
);
CREATE INDEX automation_runs_workspace_idx ON public.automation_runs(workspace_id, created_at DESC);
CREATE INDEX automation_runs_automation_idx ON public.automation_runs(automation_id, created_at DESC);
CREATE INDEX automation_runs_due_idx ON public.automation_runs(status, resume_at);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automation runs" ON public.automation_runs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ======================= automation_run_steps ========================
CREATE TABLE public.automation_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_id uuid,
  position integer NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','skipped','waiting','failed')),
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (run_id, position, kind)
);
CREATE INDEX automation_run_steps_run_idx ON public.automation_run_steps(run_id, position);

GRANT SELECT ON public.automation_run_steps TO authenticated;
GRANT ALL ON public.automation_run_steps TO service_role;
ALTER TABLE public.automation_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read automation run steps" ON public.automation_run_steps FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================ plan limit =============================
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_automations integer;

-- ===================== worker claim (single flight) ==================
CREATE OR REPLACE FUNCTION public.claim_automation_runs(_worker text, _limit integer)
RETURNS SETOF public.automation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Recover runs whose worker died mid-execution.
  UPDATE public.automation_runs
  SET status = 'queued', locked_by = NULL, locked_at = NULL
  WHERE status = 'running' AND locked_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM public.automation_runs r
    WHERE (r.status = 'queued' OR (r.status = 'waiting' AND r.resume_at IS NOT NULL AND r.resume_at <= now()))
    ORDER BY r.created_at
    LIMIT greatest(1, least(_limit, 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.automation_runs r
  SET status = 'running',
      locked_by = _worker,
      locked_at = now(),
      attempts = r.attempts + 1,
      started_at = coalesce(r.started_at, now())
  FROM due
  WHERE r.id = due.id
  RETURNING r.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_automation_runs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_runs(text, integer) TO service_role;

-- ============================ scheduler ==============================
INSERT INTO public.platform_settings (key, value)
VALUES (
  'automation_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/run-automations',
    'token', encode(gen_random_bytes(32), 'hex'),
    'limit', 50
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_automation_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cfg jsonb; base text; token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'automation_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := jsonb_build_object('limit', coalesce((cfg ->> 'limit')::int, 50))
  );
END;
$function$;

SELECT cron.unschedule('sendloop-automation-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sendloop-automation-runner');

SELECT cron.schedule('sendloop-automation-runner', '* * * * *', $$SELECT public.run_automation_runner();$$);

-- ============================= realtime ==============================
ALTER TABLE public.automations REPLICA IDENTITY FULL;
ALTER TABLE public.automation_runs REPLICA IDENTITY FULL;
ALTER TABLE public.automation_run_steps REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_run_steps;