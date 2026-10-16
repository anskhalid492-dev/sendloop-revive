-- OWNER REVIEW REQUIRED: run manually against production rihgzkofoxcjljlbvbya.
-- Additive only; no history, settings, campaigns or billing records are reset.
SET lock_timeout = '5s';
ALTER TABLE public.warmup_settings
  ADD COLUMN IF NOT EXISTS progression_mode text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS progression_stages jsonb NOT NULL DEFAULT '[{"start_day":1,"end_day":8,"min_emails":1,"max_emails":7},{"start_day":9,"end_day":18,"min_emails":7,"max_emails":15},{"start_day":19,"end_day":25,"min_emails":15,"max_emails":30}]',
  ADD COLUMN IF NOT EXISTS manual_daily_limit integer,
  ADD COLUMN IF NOT EXISTS progression_day integer,
  ADD COLUMN IF NOT EXISTS progression_date date,
  ADD COLUMN IF NOT EXISTS progression_limit integer,
  ADD COLUMN IF NOT EXISTS progression_review_required boolean NOT NULL DEFAULT true;
-- Legacy rows retain their old engine until explicitly reviewed/opted in.
-- Defaults change only for subsequently inserted settings.
ALTER TABLE public.warmup_settings ALTER COLUMN progression_mode SET DEFAULT 'automatic';
ALTER TABLE public.warmup_settings ALTER COLUMN progression_day SET DEFAULT 1;
ALTER TABLE public.warmup_settings ALTER COLUMN progression_limit SET DEFAULT 1;
ALTER TABLE public.warmup_settings ALTER COLUMN progression_review_required SET DEFAULT false;
ALTER TABLE public.warmup_jobs ADD COLUMN IF NOT EXISTS send_reserved_at timestamptz;
CREATE INDEX IF NOT EXISTS warmup_jobs_reserved_day_idx ON public.warmup_jobs(sending_account_id, send_reserved_at) WHERE send_reserved_at IS NOT NULL;

-- Serializes every warmup provider attempt per mailbox/day. Reservations are
-- never refunded on an uncertain send; they are NOT success counters.
CREATE OR REPLACE FUNCTION public.reserve_mailbox_warmup_send(_job uuid, _limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.warmup_jobs; s public.warmup_settings; used integer; boundary timestamptz;
BEGIN
  SELECT * INTO j FROM public.warmup_jobs WHERE id = _job;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO s FROM public.warmup_settings WHERE sending_account_id = j.sending_account_id FOR UPDATE;
  IF NOT FOUND OR NOT s.enabled OR s.paused_by_system OR _limit <= 0 THEN RETURN false; END IF;
  SELECT * INTO j FROM public.warmup_jobs WHERE id = _job FOR UPDATE;
  IF j.status <> 'processing' OR j.send_reserved_at IS NOT NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sending_accounts a WHERE a.id = j.sending_account_id AND NOT a.paused AND a.customer_enabled AND a.status <> 'disabled') THEN RETURN false; END IF;
  boundary := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO used FROM public.warmup_jobs
    WHERE sending_account_id = j.sending_account_id AND
    (send_reserved_at >= boundary OR (send_reserved_at IS NULL AND status IN ('sent','delivered','replied') AND processed_at >= boundary));
  IF used >= LEAST(_limit, CASE WHEN s.progression_mode = 'manual' THEN COALESCE(s.manual_daily_limit, s.progression_limit, 1) WHEN s.progression_mode = 'automatic' THEN COALESCE(s.progression_limit, 1) ELSE _limit END) THEN RETURN false; END IF;
  UPDATE public.warmup_jobs SET send_reserved_at = now() WHERE id = _job;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_mailbox_warmup_send(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mailbox_warmup_send(uuid, integer) TO service_role;