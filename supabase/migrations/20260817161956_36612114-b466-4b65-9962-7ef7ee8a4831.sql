ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS inbox_rotation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inbox_rotation_strategy text NOT NULL DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS rotation_daily_cap_per_inbox integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_inbox_rotation_strategy_check
  CHECK (inbox_rotation_strategy IN ('round_robin','random','least_used'));