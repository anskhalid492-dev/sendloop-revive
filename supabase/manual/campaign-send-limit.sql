-- MunchReach — Campaign send limit
-- Run once against the production project (rihgzkofoxcjljlbvbya), SQL editor.
-- Safety: additive only. No existing column, row or campaign value is dropped,
-- renamed or rewritten. Every statement is idempotent and re-runnable.

BEGIN;

-- 1. New columns (additive; existing rows get defaults, nothing else changes)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS email_send_limit integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS emails_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limit_reached_at timestamptz;

-- 2. Sanity bound on the customer-chosen limit
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_email_send_limit_positive;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_email_send_limit_positive
  CHECK (email_send_limit > 0 AND email_send_limit <= 1000000);

-- 3. Backfill the counter from real send history, and make sure no already
--    running campaign is retroactively blocked by the 1000 default.
--    Touches ONLY the three new columns.
WITH sent AS (
  SELECT campaign_id, count(*)::int AS n
    FROM public.campaign_messages
   WHERE status = 'sent'
     AND campaign_id IS NOT NULL
   GROUP BY campaign_id
)
UPDATE public.campaigns c
   SET emails_sent_count = sent.n,
       email_send_limit  = GREATEST(c.email_send_limit, sent.n)
  FROM sent
 WHERE sent.campaign_id = c.id
   AND c.emails_sent_count = 0;

-- 4. Atomic reservation: one row-level UPDATE per email, so concurrent
--    workers can never overshoot the limit. Follow-ups are ordinary campaign
--    messages and therefore consume allowance through the same call.
CREATE OR REPLACE FUNCTION public.reserve_campaign_send(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sent integer;
  _limit integer;
BEGIN
  UPDATE public.campaigns
     SET emails_sent_count = emails_sent_count + 1
   WHERE id = _campaign_id
     AND emails_sent_count < email_send_limit
  RETURNING emails_sent_count, email_send_limit INTO _sent, _limit;

  IF FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'sent', _sent, 'limit', _limit);
  END IF;

  SELECT emails_sent_count, email_send_limit INTO _sent, _limit
    FROM public.campaigns WHERE id = _campaign_id;

  IF _limit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'sent', 0, 'limit', 0);
  END IF;

  UPDATE public.campaigns
     SET limit_reached_at = COALESCE(limit_reached_at, now())
   WHERE id = _campaign_id;

  RETURN jsonb_build_object('allowed', false, 'sent', _sent, 'limit', _limit);
END;
$$;

-- 5. Compensating release when a send fails after reservation
CREATE OR REPLACE FUNCTION public.release_campaign_send(_campaign_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.campaigns
     SET emails_sent_count = GREATEST(emails_sent_count - 1, 0)
   WHERE id = _campaign_id;
$$;

-- 6. Server-side only: customers cannot call the reservation functions
REVOKE ALL ON FUNCTION public.reserve_campaign_send(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_campaign_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_send(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_campaign_send(uuid) TO service_role;

COMMIT;
