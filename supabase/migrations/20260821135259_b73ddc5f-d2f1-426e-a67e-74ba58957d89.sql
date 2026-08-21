ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.ai_personalizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  content text,
  prompt_hash text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  model text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  edited boolean NOT NULL DEFAULT false,
  accepted boolean NOT NULL DEFAULT false,
  locked_by text,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS ai_personalizations_queue_idx
  ON public.ai_personalizations (status, created_at);
CREATE INDEX IF NOT EXISTS ai_personalizations_workspace_idx
  ON public.ai_personalizations (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_personalizations TO authenticated;
GRANT ALL ON public.ai_personalizations TO service_role;
ALTER TABLE public.ai_personalizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read workspace personalizations" ON public.ai_personalizations;
CREATE POLICY "Members read workspace personalizations"
  ON public.ai_personalizations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Members create workspace personalizations" ON public.ai_personalizations;
CREATE POLICY "Members create workspace personalizations"
  ON public.ai_personalizations FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.workspace_id = ai_personalizations.workspace_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.workspace_id = ai_personalizations.workspace_id)
  );

DROP POLICY IF EXISTS "Members update workspace personalizations" ON public.ai_personalizations;
CREATE POLICY "Members update workspace personalizations"
  ON public.ai_personalizations FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Members delete workspace personalizations" ON public.ai_personalizations;
CREATE POLICY "Members delete workspace personalizations"
  ON public.ai_personalizations FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP TRIGGER IF EXISTS ai_personalizations_touch ON public.ai_personalizations;
CREATE TRIGGER ai_personalizations_touch
  BEFORE UPDATE ON public.ai_personalizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_runner_state (
  key text PRIMARY KEY,
  locked_by text,
  locked_until timestamptz,
  paused_reason text,
  paused_at timestamptz,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_runner_state TO authenticated;
GRANT ALL ON public.ai_runner_state TO service_role;
ALTER TABLE public.ai_runner_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read AI runner state" ON public.ai_runner_state;
CREATE POLICY "Admins read AI runner state"
  ON public.ai_runner_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_runner_state (key) VALUES ('ai_personalization')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_ai_personalization_jobs(_worker text, _limit integer)
RETURNS SETOF public.ai_personalizations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ai_personalizations p
     SET status = 'processing',
         locked_by = _worker,
         locked_until = now() + interval '5 minutes',
         started_at = now(),
         attempts = p.attempts + 1
   WHERE p.id IN (
     SELECT id FROM public.ai_personalizations
      WHERE (status = 'queued' OR (status = 'processing' AND locked_until < now()))
        AND attempts < 4
      ORDER BY created_at
      LIMIT greatest(1, least(coalesce(_limit, 10), 25))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING p.*;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_personalization_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_personalization_jobs(text, integer) TO service_role;