CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  position integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;

ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_stages_select" ON public.crm_stages;
CREATE POLICY "crm_stages_select" ON public.crm_stages
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "crm_stages_write" ON public.crm_stages;
CREATE POLICY "crm_stages_write" ON public.crm_stages
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(),
          array['owner','admin','campaign_manager','inbox_manager']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(),
          array['owner','admin','campaign_manager','inbox_manager']::public.workspace_role[]));

DROP TRIGGER IF EXISTS crm_stages_updated_at ON public.crm_stages;
CREATE TRIGGER crm_stages_updated_at BEFORE UPDATE ON public.crm_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS crm_stages_workspace_position_idx
  ON public.crm_stages (workspace_id, position);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS deal_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads (workspace_id, stage_id);

CREATE OR REPLACE FUNCTION public.ensure_crm_stages(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.crm_stages (workspace_id, key, name, color, position, is_won, is_lost)
  VALUES
    (_workspace_id, 'new',            'New',            'slate',   0, false, false),
    (_workspace_id, 'contacted',      'Contacted',      'blue',    1, false, false),
    (_workspace_id, 'replied',        'Replied',        'violet',  2, false, false),
    (_workspace_id, 'meeting_booked', 'Meeting Booked', 'amber',   3, false, false),
    (_workspace_id, 'won',            'Won',            'emerald', 4, true,  false),
    (_workspace_id, 'lost',           'Lost',           'rose',    5, false, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_crm_stages(uuid) TO authenticated, service_role;

DO $$
DECLARE w record;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.ensure_crm_stages(w.id);
  END LOOP;
END $$;

UPDATE public.leads l
SET stage_id = s.id
FROM public.crm_stages s
WHERE l.stage_id IS NULL
  AND s.workspace_id = l.workspace_id
  AND s.key = CASE
    WHEN l.crm_stage = 'customer' THEN 'won'
    WHEN l.crm_stage = 'lost' OR l.status = 'not_interested' THEN 'lost'
    WHEN l.status = 'meeting' THEN 'meeting_booked'
    WHEN l.status IN ('replied', 'interested') THEN 'replied'
    WHEN l.status IN ('contacted', 'completed', 'paused') THEN 'contacted'
    ELSE 'new'
  END;

CREATE OR REPLACE FUNCTION public.seed_workspace_crm_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_crm_stages(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_crm_stages ON public.workspaces;
CREATE TRIGGER workspaces_seed_crm_stages AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_workspace_crm_stages();

CREATE OR REPLACE FUNCTION public.delete_crm_stage(_stage_id uuid, _move_to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ws uuid;
BEGIN
  SELECT workspace_id INTO ws FROM public.crm_stages WHERE id = _stage_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(),
        array['owner','admin','campaign_manager']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF _move_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_stages WHERE id = _move_to AND workspace_id = ws
  ) THEN
    RAISE EXCEPTION 'Target stage is not in this workspace';
  END IF;

  UPDATE public.leads SET stage_id = _move_to WHERE stage_id = _stage_id;
  DELETE FROM public.crm_stages WHERE id = _stage_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_crm_stage(uuid, uuid) TO authenticated, service_role;