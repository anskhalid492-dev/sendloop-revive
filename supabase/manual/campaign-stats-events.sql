-- Campaign statistics read from the real per-message event table.
--
-- Until now `campaign_stats` only trusted the denormalised timestamp columns on
-- `campaign_messages` (opened_at / clicked_at / bounced_at / ...). Those are
-- written by the webhook handler, so any handler hiccup, replay or race made a
-- bounce / open / click invisible on the campaign page.
--
-- The function below now derives every engagement signal from
-- `public.email_engagement_events` (one row per real provider event, keyed by
-- message) and falls back to the message column. Counting stays message-level
-- and de-duplicated: many events for one message still count once.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.campaign_stats(
  _workspace_id uuid,
  _campaign_ids uuid[] DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  campaign_id uuid,
  campaign_name text,
  status text,
  leads bigint,
  queued bigint,
  sending bigint,
  sent bigint,
  delivered bigint,
  opened bigint,
  clicked bigint,
  replied bigint,
  positive_replied bigint,
  bounced bigint,
  unsubscribed bigint,
  complained bigint,
  failed bigint,
  remaining bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  lo timestamptz := coalesce(_from, '-infinity'::timestamptz);
  hi timestamptz := coalesce(_to, 'infinity'::timestamptz);
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH scope AS (
    SELECT c.id, c.name, c.status::text AS status
    FROM public.campaigns c
    WHERE c.workspace_id = _workspace_id
      AND (_campaign_ids IS NULL OR c.id = ANY(_campaign_ids))
  ), ev AS (
    -- Real provider events, collapsed to the FIRST occurrence per message and
    -- per signal. This is the authoritative engagement source.
    SELECT
      e.message_id AS mid,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('delivered', 'delivery')) AS delivered_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('opened', 'open')) AS opened_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('clicked', 'click')) AS clicked_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('bounced', 'bounce', 'hard_bounce', 'soft_bounce')) AS bounced_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('complained', 'complaint', 'spam')) AS complained_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('unsubscribed', 'unsubscribe')) AS unsubscribed_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('replied', 'reply')) AS replied_at,
      min(e.occurred_at) FILTER (WHERE e.event_type IN ('failed', 'dropped', 'rejected')) AS failed_at
    FROM public.email_engagement_events e
    WHERE e.workspace_id = _workspace_id
      AND e.message_id IS NOT NULL
      AND (_campaign_ids IS NULL OR e.campaign_id IS NULL OR e.campaign_id = ANY(_campaign_ids))
    GROUP BY e.message_id
  ), sig AS (
    -- One row per message with the effective signal times: whichever of the
    -- event feed or the stored column saw the signal first.
    SELECT
      m.campaign_id AS cid,
      m.id,
      m.lead_id,
      m.status::text AS status,
      m.updated_at,
      m.sent_at,
      least(m.delivered_at, ev.delivered_at) AS delivered_at,
      least(m.opened_at, ev.opened_at) AS opened_at,
      least(m.clicked_at, ev.clicked_at) AS clicked_at,
      least(m.replied_at, ev.replied_at) AS replied_at,
      least(m.bounced_at, ev.bounced_at) AS bounced_at,
      least(m.complained_at, ev.complained_at) AS complained_at,
      least(m.unsubscribed_at, ev.unsubscribed_at) AS unsubscribed_at,
      least(m.failed_at, ev.failed_at) AS failed_at
    FROM public.campaign_messages m
    LEFT JOIN ev ON ev.mid = m.id
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
      AND m.campaign_id IS NOT NULL
      AND (_campaign_ids IS NULL OR m.campaign_id = ANY(_campaign_ids))
  ), msg AS (
    SELECT
      s.cid,
      count(*) FILTER (WHERE s.sent_at IS NOT NULL AND s.sent_at >= lo AND s.sent_at < hi)::bigint AS sent,
      count(*) FILTER (
        WHERE s.delivered_at IS NOT NULL AND s.delivered_at >= lo AND s.delivered_at < hi
          AND s.bounced_at IS NULL AND s.failed_at IS NULL
      )::bigint AS delivered,
      count(*) FILTER (WHERE s.opened_at IS NOT NULL AND s.opened_at >= lo AND s.opened_at < hi)::bigint AS opened,
      count(*) FILTER (WHERE s.clicked_at IS NOT NULL AND s.clicked_at >= lo AND s.clicked_at < hi)::bigint AS clicked,
      count(DISTINCT coalesce(s.lead_id::text, s.id::text)) FILTER (
        WHERE s.replied_at IS NOT NULL AND s.replied_at >= lo AND s.replied_at < hi
      )::bigint AS replied,
      count(*) FILTER (WHERE s.bounced_at IS NOT NULL AND s.bounced_at >= lo AND s.bounced_at < hi)::bigint AS bounced,
      count(*) FILTER (WHERE s.unsubscribed_at IS NOT NULL AND s.unsubscribed_at >= lo AND s.unsubscribed_at < hi)::bigint AS unsubscribed,
      count(*) FILTER (WHERE s.complained_at IS NOT NULL AND s.complained_at >= lo AND s.complained_at < hi)::bigint AS complained,
      -- Terminal states are mutually exclusive: a bounce is never also a failure.
      count(*) FILTER (
        WHERE s.bounced_at IS NULL
          AND (
            (s.failed_at IS NOT NULL AND s.failed_at >= lo AND s.failed_at < hi)
            OR (s.failed_at IS NULL AND s.status = 'failed' AND s.updated_at >= lo AND s.updated_at < hi)
          )
      )::bigint AS failed,
      count(*) FILTER (WHERE s.sent_at IS NULL AND s.status IN ('pending', 'scheduled', 'queued'))::bigint AS queued,
      count(*) FILTER (WHERE s.sent_at IS NULL AND s.status = 'processing')::bigint AS sending,
      count(DISTINCT s.lead_id) FILTER (WHERE s.sent_at IS NOT NULL)::bigint AS contacted_leads
    FROM sig s
    GROUP BY s.cid
  ), pos AS (
    SELECT r.campaign_id AS cid,
      count(DISTINCT coalesce(r.lead_id::text, lower(r.from_email), r.id::text))::bigint AS positive_replied
    FROM public.campaign_replies r
    WHERE r.workspace_id = _workspace_id
      AND r.campaign_id IS NOT NULL
      AND r.sentiment = 'positive'
      AND r.received_at >= lo AND r.received_at < hi
      AND (_campaign_ids IS NULL OR r.campaign_id = ANY(_campaign_ids))
    GROUP BY r.campaign_id
  ), aud AS (
    SELECT cr.campaign_id AS cid, count(*)::bigint AS leads
    FROM public.campaign_recipients cr
    WHERE cr.workspace_id = _workspace_id
      AND (_campaign_ids IS NULL OR cr.campaign_id = ANY(_campaign_ids))
    GROUP BY cr.campaign_id
  )
  SELECT
    s.id, s.name, s.status,
    coalesce(a.leads, 0),
    coalesce(m.queued, 0),
    coalesce(m.sending, 0),
    coalesce(m.sent, 0),
    coalesce(m.delivered, 0),
    coalesce(m.opened, 0),
    coalesce(m.clicked, 0),
    coalesce(m.replied, 0),
    coalesce(p.positive_replied, 0),
    coalesce(m.bounced, 0),
    coalesce(m.unsubscribed, 0),
    coalesce(m.complained, 0),
    coalesce(m.failed, 0),
    greatest(coalesce(a.leads, 0) - coalesce(m.contacted_leads, 0), 0)
  FROM scope s
  LEFT JOIN msg m ON m.cid = s.id
  LEFT JOIN pos p ON p.cid = s.id
  LEFT JOIN aud a ON a.cid = s.id
  ORDER BY coalesce(m.sent, 0) DESC, s.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.campaign_stats(uuid, uuid[], timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_stats(uuid, uuid[], timestamptz, timestamptz) TO service_role;

-- Fast lookups for the event join.
CREATE INDEX IF NOT EXISTS email_engagement_events_message_idx
  ON public.email_engagement_events (message_id, event_type);
CREATE INDEX IF NOT EXISTS email_engagement_events_ws_campaign_idx
  ON public.email_engagement_events (workspace_id, campaign_id, occurred_at DESC);

-- Push every new event to subscribed browsers so the campaign page refreshes
-- the instant a bounce / open / click lands.
ALTER TABLE public.email_engagement_events REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_engagement_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
