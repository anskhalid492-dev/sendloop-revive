ALTER TABLE public.ai_personalizations
  ADD COLUMN IF NOT EXISTS pain_points jsonb NOT NULL DEFAULT '[]'::jsonb;