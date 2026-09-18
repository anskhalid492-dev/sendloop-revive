-- =====================================================================
-- MunchReach — why a queued campaign email was cancelled. IDEMPOTENT.
--
-- Run this against the LIVE database that munchreach.com talks to, BEFORE
-- re-running supabase/manual/campaign-scale-rpcs.sql (the aggregates there
-- read the new column).
--
-- Additive only: one nullable column, one partial index and a backfill of
-- existing cancelled rows. Nothing is dropped, deleted or rewritten.
--
-- Problem it fixes: when a recipient bounced or unsubscribed part-way through
-- a sequence, their remaining queued emails were set to "cancelled" with no
-- reason, so the bounce/unsubscribe was never counted anywhere (campaign
-- status tiles, campaign Analytics, workspace Analytics, engagement rates).
-- =====================================================================

ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

COMMENT ON COLUMN public.campaign_messages.cancelled_reason IS
  'Why this message was cancelled: recipient_bounced | recipient_unsubscribed | recipient_complained | recipient_replied | sequence_stopped | manual';

CREATE INDEX IF NOT EXISTS campaign_messages_cancelled_reason_idx
  ON public.campaign_messages (campaign_id, cancelled_reason)
  WHERE cancelled_reason IS NOT NULL;

-- ---------------------------------------------------------------------
-- Backfill: reconstruct the reason for already-cancelled messages from the
-- history that already exists for that recipient. Only fills NULLs, so it is
-- safe to run repeatedly.
-- ---------------------------------------------------------------------

-- 1. The recipient row already records the terminal outcome.
UPDATE public.campaign_messages m
SET cancelled_reason = CASE r.status::text
    WHEN 'bounced' THEN 'recipient_bounced'
    WHEN 'unsubscribed' THEN 'recipient_unsubscribed'
    WHEN 'replied' THEN 'recipient_replied'
  END
FROM public.campaign_recipients r
WHERE m.status::text = 'cancelled'
  AND m.cancelled_reason IS NULL
  AND (r.id = m.recipient_id OR (m.recipient_id IS NULL AND r.campaign_id = m.campaign_id AND r.lead_id = m.lead_id))
  AND r.status::text IN ('bounced', 'unsubscribed', 'replied');

-- 2. Another message for the same recipient carries the provider signal.
UPDATE public.campaign_messages m
SET cancelled_reason = s.reason
FROM (
  SELECT
    x.campaign_id,
    coalesce(x.recipient_id::text, x.lead_id::text) AS person,
    CASE
      WHEN bool_or(x.bounced_at IS NOT NULL) THEN 'recipient_bounced'
      WHEN bool_or(x.complained_at IS NOT NULL) THEN 'recipient_complained'
      WHEN bool_or(x.unsubscribed_at IS NOT NULL) THEN 'recipient_unsubscribed'
      WHEN bool_or(x.replied_at IS NOT NULL) THEN 'recipient_replied'
    END AS reason
  FROM public.campaign_messages x
  WHERE coalesce(x.recipient_id::text, x.lead_id::text) IS NOT NULL
  GROUP BY 1, 2
) s
WHERE m.status::text = 'cancelled'
  AND m.cancelled_reason IS NULL
  AND s.reason IS NOT NULL
  AND s.campaign_id = m.campaign_id
  AND s.person = coalesce(m.recipient_id::text, m.lead_id::text);

-- 3. The lead activity log recorded the event.
UPDATE public.campaign_messages m
SET cancelled_reason = a.reason
FROM (
  SELECT la.lead_id,
    CASE
      WHEN bool_or(la.type = 'bounced') THEN 'recipient_bounced'
      WHEN bool_or(la.type = 'complained') THEN 'recipient_complained'
      WHEN bool_or(la.type = 'unsubscribed') THEN 'recipient_unsubscribed'
    END AS reason
  FROM public.lead_activities la
  WHERE la.type IN ('bounced', 'complained', 'unsubscribed')
  GROUP BY la.lead_id
) a
WHERE m.status::text = 'cancelled'
  AND m.cancelled_reason IS NULL
  AND a.reason IS NOT NULL
  AND a.lead_id = m.lead_id;

-- 4. The workspace suppression list is the last source of truth.
UPDATE public.campaign_messages m
SET cancelled_reason = CASE
    WHEN sup.reason ILIKE '%bounce%' THEN 'recipient_bounced'
    WHEN sup.reason ILIKE '%complain%' OR sup.reason ILIKE '%spam%' THEN 'recipient_complained'
    ELSE 'recipient_unsubscribed'
  END
FROM public.email_suppressions sup
WHERE m.status::text = 'cancelled'
  AND m.cancelled_reason IS NULL
  AND sup.workspace_id = m.workspace_id
  AND lower(sup.email) = lower(m.to_email);

-- 5. Everything else was a plain sequence stop.
UPDATE public.campaign_messages
SET cancelled_reason = 'sequence_stopped'
WHERE status::text = 'cancelled' AND cancelled_reason IS NULL;

NOTIFY pgrst, 'reload schema';

-- Verification (per campaign):
-- SELECT cancelled_reason, count(*) FROM public.campaign_messages
-- WHERE campaign_id = '<campaign id>' AND status::text = 'cancelled'
-- GROUP BY 1 ORDER BY 2 DESC;
