CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid NULL,
  details text NOT NULL,
  screenshot_path text NULL,
  screenshot_name text NULL,
  screenshot_size integer NULL,
  status text NOT NULL DEFAULT 'new',
  admin_note text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bug_reports_status_check'
  ) THEN
    ALTER TABLE public.bug_reports
      ADD CONSTRAINT bug_reports_status_check
      CHECK (status IN ('new', 'in_progress', 'resolved', 'closed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bug_reports_user_idx ON public.bug_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON public.bug_reports (status, created_at DESC);

GRANT SELECT, INSERT ON public.bug_reports TO authenticated;
GRANT UPDATE (status, admin_note, updated_at) ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users create their own bug reports" ON public.bug_reports;
CREATE POLICY "Users create their own bug reports"
  ON public.bug_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read their own bug reports" ON public.bug_reports;
CREATE POLICY "Users read their own bug reports"
  ON public.bug_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff read all bug reports" ON public.bug_reports;
CREATE POLICY "Staff read all bug reports"
  ON public.bug_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

DROP POLICY IF EXISTS "Staff update bug reports" ON public.bug_reports;
CREATE POLICY "Staff update bug reports"
  ON public.bug_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bug_reports_set_updated_at ON public.bug_reports;
CREATE TRIGGER bug_reports_set_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();