ALTER TABLE public.ai_personalizations
  ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS data_used text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE public.ai_personalizations
    ADD CONSTRAINT ai_personalizations_quality_check
    CHECK (quality IN ('complete','limited','fallback'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ai_personalizations_campaign_quality_idx
  ON public.ai_personalizations (campaign_id, quality);