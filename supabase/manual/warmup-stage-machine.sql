-- Run manually against the LIVE production project (rihgzkofoxcjljlbvbya).
-- Purely additive: adds warmup ramp/recovery state columns and history fields.
-- Safe to run more than once. No existing data is changed or removed.

SET lock_timeout = '5s';

-- Ramp state machine state on each mailbox's warmup settings.
ALTER TABLE public.warmup_settings
  ADD COLUMN IF NOT EXISTS ramp_stage text NOT NULL DEFAULT 'ramp_up',
  ADD COLUMN IF NOT EXISTS stage_since timestamptz,
  ADD COLUMN IF NOT EXISTS stage_reason text,
  ADD COLUMN IF NOT EXISTS current_volume smallint,
  ADD COLUMN IF NOT EXISTS hold_failure_rate smallint DEFAULT 10,
  ADD COLUMN IF NOT EXISTS recovery_bounce_rate smallint DEFAULT 5,
  ADD COLUMN IF NOT EXISTS recovery_days smallint DEFAULT 3;

-- History: what the ramp planned and what it did, per day.
ALTER TABLE public.warmup_daily_stats
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS stage_action text,
  ADD COLUMN IF NOT EXISTS planned_target smallint;

-- Keeps the ramp's 14-day lookback cheap at thousands of mailboxes.
CREATE INDEX IF NOT EXISTS warmup_daily_stats_account_day_idx
  ON public.warmup_daily_stats (sending_account_id, day DESC);
