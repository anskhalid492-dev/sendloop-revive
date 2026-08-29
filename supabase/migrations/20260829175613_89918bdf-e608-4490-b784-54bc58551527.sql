ALTER TABLE public.marketing_templates
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_templates_type_check') THEN
    ALTER TABLE public.marketing_templates
      ADD CONSTRAINT marketing_templates_type_check CHECK (type IN ('built_in','custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_templates_status_check') THEN
    ALTER TABLE public.marketing_templates
      ADD CONSTRAINT marketing_templates_status_check CHECK (status IN ('active','archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_templates_status ON public.marketing_templates (status);
CREATE INDEX IF NOT EXISTS idx_marketing_templates_category ON public.marketing_templates (category);