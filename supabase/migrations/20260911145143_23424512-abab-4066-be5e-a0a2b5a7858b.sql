CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  type text NOT NULL,
  r2_key text NOT NULL UNIQUE,
  file_name text,
  size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS files_user_created_idx ON public.files (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS files_workspace_idx ON public.files (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS files_type_idx ON public.files (type, created_at DESC);
CREATE INDEX IF NOT EXISTS files_expires_idx ON public.files (expires_at) WHERE expires_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "files_owner_all" ON public.files;
CREATE POLICY "files_owner_all" ON public.files
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "files_workspace_read" ON public.files;
CREATE POLICY "files_workspace_read" ON public.files
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "files_admin_read" ON public.files;
CREATE POLICY "files_admin_read" ON public.files
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS files_set_updated_at ON public.files;
CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();