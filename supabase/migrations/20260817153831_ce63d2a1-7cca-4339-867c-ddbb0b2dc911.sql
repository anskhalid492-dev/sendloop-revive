ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS min_delay_minutes smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS random_delay_minutes smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_per_hour integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS business_days_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS click_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS text_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_on_company_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_contacts_per_company smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribe_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.campaign_steps
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS step_type text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS delay_minutes smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS same_thread boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.campaign_step_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.campaign_steps(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'A',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  weight smallint NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_step_variants_step_idx ON public.campaign_step_variants (step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_step_variants TO authenticated;
GRANT ALL ON public.campaign_step_variants TO service_role;

ALTER TABLE public.campaign_step_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_step_variants_select ON public.campaign_step_variants;
CREATE POLICY campaign_step_variants_select ON public.campaign_step_variants FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS campaign_step_variants_insert ON public.campaign_step_variants;
CREATE POLICY campaign_step_variants_insert ON public.campaign_step_variants FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
DROP POLICY IF EXISTS campaign_step_variants_update ON public.campaign_step_variants;
CREATE POLICY campaign_step_variants_update ON public.campaign_step_variants FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
DROP POLICY IF EXISTS campaign_step_variants_delete ON public.campaign_step_variants;
CREATE POLICY campaign_step_variants_delete ON public.campaign_step_variants FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

DROP TRIGGER IF EXISTS campaign_step_variants_updated_at ON public.campaign_step_variants;
CREATE TRIGGER campaign_step_variants_updated_at BEFORE UPDATE ON public.campaign_step_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();