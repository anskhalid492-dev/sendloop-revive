ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS bounce_reason text;

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz;

COMMENT ON COLUMN public.campaign_messages.bounce_reason IS 'Provider explanation for the bounce on this email (e.g. 550 mailbox unavailable).';
COMMENT ON COLUMN public.campaign_recipients.bounce_reason IS 'Provider explanation for the most recent bounce for this recipient.';

CREATE INDEX IF NOT EXISTS campaign_messages_bounce_reason_idx
  ON public.campaign_messages (campaign_id)
  WHERE bounce_reason IS NOT NULL;

-- Backfill from the error text already stored against bounced emails.
UPDATE public.campaign_messages
SET bounce_reason = nullif(btrim(last_error), '')
WHERE bounce_reason IS NULL
  AND nullif(btrim(coalesce(last_error, '')), '') IS NOT NULL
  AND (bounced_at IS NOT NULL OR delivery_status = 'bounced' OR cancelled_reason = 'recipient_bounced');

-- Carry the reason and bounce time onto the recipient row.
UPDATE public.campaign_recipients r
SET bounce_reason = coalesce(r.bounce_reason, s.reason),
    bounced_at = coalesce(r.bounced_at, s.bounced_at)
FROM (
  SELECT m.campaign_id,
         m.lead_id,
         max(m.bounced_at) AS bounced_at,
         (array_agg(m.bounce_reason ORDER BY m.bounced_at DESC NULLS LAST) FILTER (WHERE m.bounce_reason IS NOT NULL))[1] AS reason
  FROM public.campaign_messages m
  WHERE m.bounced_at IS NOT NULL OR m.cancelled_reason = 'recipient_bounced' OR m.bounce_reason IS NOT NULL
  GROUP BY m.campaign_id, m.lead_id
) s
WHERE s.campaign_id = r.campaign_id
  AND s.lead_id = r.lead_id
  AND (r.bounce_reason IS NULL OR r.bounced_at IS NULL);

NOTIFY pgrst, 'reload schema';