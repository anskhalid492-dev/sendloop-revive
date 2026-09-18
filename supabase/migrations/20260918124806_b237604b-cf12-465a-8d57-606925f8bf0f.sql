ALTER TABLE public.warmup_settings
  ADD COLUMN IF NOT EXISTS ramp_stage text NOT NULL DEFAULT 'ramp_up',
  ADD COLUMN IF NOT EXISTS stage_since timestamptz,
  ADD COLUMN IF NOT EXISTS stage_reason text,
  ADD COLUMN IF NOT EXISTS current_volume smallint,
  ADD COLUMN IF NOT EXISTS hold_failure_rate smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS recovery_bounce_rate smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS recovery_days smallint NOT NULL DEFAULT 3;

ALTER TABLE public.warmup_daily_stats
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS stage_action text,
  ADD COLUMN IF NOT EXISTS planned_target smallint;

CREATE INDEX IF NOT EXISTS warmup_daily_stats_account_day_idx
  ON public.warmup_daily_stats (sending_account_id, day DESC);