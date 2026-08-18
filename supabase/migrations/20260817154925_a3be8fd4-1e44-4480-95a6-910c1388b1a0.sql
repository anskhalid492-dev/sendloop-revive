ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS crm_stage text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_workspace_created_idx ON public.leads (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_tags_idx ON public.leads USING gin (tags);

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read lead notes" ON public.lead_notes FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members create lead notes" ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "Authors update lead notes" ON public.lead_notes FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid())
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "Members delete lead notes" ON public.lead_notes FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER lead_notes_updated_at BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  due_at timestamptz,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tasks TO authenticated;
GRANT ALL ON public.lead_tasks TO service_role;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read lead tasks" ON public.lead_tasks FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members create lead tasks" ON public.lead_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Members update lead tasks" ON public.lead_tasks FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members delete lead tasks" ON public.lead_tasks FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER lead_tasks_updated_at BEFORE UPDATE ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  type text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read lead activity" ON public.lead_activities FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members write lead activity" ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS lead_activities_lead_idx ON public.lead_activities (lead_id, created_at DESC);