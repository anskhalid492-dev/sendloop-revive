ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_domains integer,
  ADD COLUMN IF NOT EXISTS max_active_campaigns integer,
  ADD COLUMN IF NOT EXISTS max_ai_monthly integer,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0;