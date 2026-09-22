ALTER TABLE public.lead_activities ADD COLUMN IF NOT EXISTS actor_id UUID;
CREATE INDEX IF NOT EXISTS lead_activities_lead_created_idx ON public.lead_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_workspace_stage_idx ON public.leads (workspace_id, stage_id);