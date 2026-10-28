-- Owner-applied additive Help Center CMS extension. No existing rows are changed.
BEGIN;
ALTER TABLE public.guide_articles
  ADD COLUMN IF NOT EXISTS help_center boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS help_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Return only slugs: draft bodies/metadata stay behind existing admin RLS.
CREATE OR REPLACE FUNCTION public.help_center_override_slugs()
RETURNS TABLE(slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT g.slug FROM public.guide_articles g WHERE g.help_center = true $$;
REVOKE ALL ON FUNCTION public.help_center_override_slugs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.help_center_override_slugs() TO anon, authenticated, service_role;
COMMIT;

-- Verification (read-only)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'guide_articles'
AND column_name IN ('help_center', 'help_metadata', 'deleted_at');
SELECT * FROM public.help_center_override_slugs();