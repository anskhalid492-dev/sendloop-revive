-- Background CSV lead imports (additive, rerunnable).
--
-- The browser uploads the CSV straight to the private R2 bucket and then
-- creates a row here. A worker leases the job, reads the object in byte ranges
-- and inserts leads in batches, recording its byte offset so a failed chunk
-- resumes instead of restarting. Lead rules, RLS and the leads schema are
-- untouched.

CREATE TABLE IF NOT EXISTS public.lead_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  file_id UUID,
  r2_key TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded',
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  list_id UUID,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  list_verified BOOLEAN NOT NULL DEFAULT false,
  total_rows INTEGER,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  byte_offset BIGINT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_import_jobs ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.lead_import_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.lead_import_jobs ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lead_import_jobs_workspace_created_idx
  ON public.lead_import_jobs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_import_jobs_pending_idx
  ON public.lead_import_jobs (status, lease_until)
  WHERE status IN ('uploaded', 'processing');

GRANT SELECT, INSERT, UPDATE ON public.lead_import_jobs TO authenticated;
GRANT ALL ON public.lead_import_jobs TO service_role;

ALTER TABLE public.lead_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_import_jobs_select_member" ON public.lead_import_jobs;
CREATE POLICY "lead_import_jobs_select_member"
  ON public.lead_import_jobs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "lead_import_jobs_insert_member" ON public.lead_import_jobs;
CREATE POLICY "lead_import_jobs_insert_member"
  ON public.lead_import_jobs FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());

-- Members may only cancel/retry their workspace's jobs; the worker itself runs
-- as service_role, so counters can never be edited from the browser beyond the
-- status column checks enforced in the server functions.
DROP POLICY IF EXISTS "lead_import_jobs_update_member" ON public.lead_import_jobs;
CREATE POLICY "lead_import_jobs_update_member"
  ON public.lead_import_jobs FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS lead_import_jobs_set_updated_at ON public.lead_import_jobs;
CREATE TRIGGER lead_import_jobs_set_updated_at
  BEFORE UPDATE ON public.lead_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
