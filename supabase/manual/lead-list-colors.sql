-- Additive only. Run manually in production before publishing list color support.
-- No lead rows, existing colors, policies, grants or constraints are changed.
ALTER TABLE public.lead_lists ADD COLUMN IF NOT EXISTS color text;
-- NULL on an existing list renders using the UI default; no historical backfill.
ALTER TABLE public.lead_lists ALTER COLUMN color SET DEFAULT 'blue';

-- Read-only verification:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'lead_lists' AND column_name = 'color';