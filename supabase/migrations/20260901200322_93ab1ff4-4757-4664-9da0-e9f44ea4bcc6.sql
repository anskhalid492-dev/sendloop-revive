-- One authoritative per-campaign statistics source.
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
  ), msg AS (
    -- One row per message: retries and duplicate provider callbacks update the
    -- same row, so nothing here can be counted twice.
    SELECT
      m.campaign_id AS cid,
      count(*) FILTER (WHERE m.sent_at IS NOT NULL AND m.sent_at >= lo AND m.sent_at < hi)::bigint AS sent,
      count(*) FILTER (
        WHERE m.delivered_at IS NOT NULL AND m.delivered_at >= lo AND m.delivered_at < hi
          AND m.bounced_at IS NULL AND m.failed_at IS NULL
      )::bigint AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL AND m.opened_at >= lo AND m.opened_at < hi)::bigint AS opened,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL AND m.clicked_at >= lo AND m.clicked_at < hi)::bigint AS clicked,
      count(DISTINCT coalesce(m.lead_id::text, m.id::text)) FILTER (
        WHERE m.replied_at IS NOT NULL AND m.replied_at >= lo AND m.replied_at < hi
      )::bigint AS replied,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL AND m.bounced_at >= lo AND m.bounced_at < hi)::bigint AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL AND m.unsubscribed_at >= lo AND m.unsubscribed_at < hi)::bigint AS unsubscribed,
      count(*) FILTER (WHERE m.complained_at IS NOT NULL AND m.complained_at >= lo AND m.complained_at < hi)::bigint AS complained,
      -- Terminal states are mutually exclusive: a bounce is never also a failure.
      count(*) FILTER (
        WHERE m.bounced_at IS NULL
          AND (
            (m.failed_at IS NOT NULL AND m.failed_at >= lo AND m.failed_at < hi)
            OR (m.failed_at IS NULL AND m.status = 'failed' AND m.updated_at >= lo AND m.updated_at < hi)
          )
      )::bigint AS failed,
      count(*) FILTER (WHERE m.sent_at IS NULL AND m.status IN ('pending', 'scheduled', 'queued'))::bigint AS queued,
      count(*) FILTER (WHERE m.sent_at IS NULL AND m.status = 'processing')::bigint AS sending,
      count(DISTINCT m.lead_id) FILTER (WHERE m.sent_at IS NOT NULL)::bigint AS contacted_leads
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
      AND m.campaign_id IS NOT NULL
      AND (_campaign_ids IS NULL OR m.campaign_id = ANY(_campaign_ids))
    GROUP BY m.campaign_id
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

-- Per-campaign analytics now delegates to the single source above.
CREATE OR REPLACE FUNCTION public.analytics_by_campaign(_workspace_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(campaign_id uuid, campaign_name text, status text, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, positive_replies bigint, bounced bigint, unsubscribed bigint, complained bigint, failed bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT s.campaign_id, s.campaign_name, s.status, s.sent, s.delivered, s.opened, s.clicked,
         s.replied, s.positive_replied, s.bounced, s.unsubscribed, s.complained, s.failed
  FROM public.campaign_stats(_workspace_id, NULL, _from, _to) s
  ORDER BY s.sent DESC, s.campaign_name;
$function$;

-- Workspace totals are the sum of the same per-campaign numbers.
CREATE OR REPLACE FUNCTION public.analytics_summary(_workspace_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint, complained bigint, failed bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    coalesce(sum(s.sent), 0)::bigint,
    coalesce(sum(s.delivered), 0)::bigint,
    coalesce(sum(s.opened), 0)::bigint,
    coalesce(sum(s.clicked), 0)::bigint,
    coalesce(sum(s.replied), 0)::bigint,
    coalesce(sum(s.bounced), 0)::bigint,
    coalesce(sum(s.unsubscribed), 0)::bigint,
    coalesce(sum(s.complained), 0)::bigint,
    coalesce(sum(s.failed), 0)::bigint
  FROM public.campaign_stats(_workspace_id, NULL, _from, _to) s;
$function$;

-- Diagnostic: proves the campaign totals reconcile with the raw message rows.
CREATE OR REPLACE FUNCTION public.campaign_stats_reconcile(_workspace_id uuid, _campaign_id uuid)
RETURNS TABLE(check_name text, expected bigint, actual bigint, ok boolean)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  raw record;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  SELECT * INTO s FROM public.campaign_stats(_workspace_id, ARRAY[_campaign_id], NULL, NULL) LIMIT 1;

  SELECT
    count(*)::bigint AS messages,
    count(DISTINCT m.id)::bigint AS unique_messages,
    count(*) FILTER (WHERE m.sent_at IS NOT NULL)::bigint AS sent,
    count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL)::bigint AS delivered,
    count(*) FILTER (WHERE m.bounced_at IS NOT NULL)::bigint AS bounced,
    count(*) FILTER (WHERE m.bounced_at IS NULL AND (m.failed_at IS NOT NULL OR m.status = 'failed'))::bigint AS failed,
    count(*) FILTER (WHERE m.bounced_at IS NOT NULL AND m.delivered_at IS NOT NULL AND m.failed_at IS NOT NULL)::bigint AS overlapping
  INTO raw
  FROM public.campaign_messages m
  WHERE m.workspace_id = _workspace_id AND m.campaign_id = _campaign_id AND m.message_type = 'campaign';

  RETURN QUERY VALUES
    ('unique_messages', raw.messages, raw.unique_messages, raw.messages = raw.unique_messages),
    ('sent', raw.sent, coalesce(s.sent, 0), raw.sent = coalesce(s.sent, 0)),
    ('delivered', raw.delivered, coalesce(s.delivered, 0), raw.delivered = coalesce(s.delivered, 0)),
    ('bounced', raw.bounced, coalesce(s.bounced, 0), raw.bounced = coalesce(s.bounced, 0)),
    ('failed', raw.failed, coalesce(s.failed, 0), raw.failed = coalesce(s.failed, 0)),
    ('no_overlapping_terminal_states', 0::bigint, raw.overlapping, raw.overlapping = 0),
    ('leads_cover_contacted', coalesce(s.leads, 0), coalesce(s.leads, 0) - coalesce(s.remaining, 0), coalesce(s.remaining, 0) >= 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.campaign_stats_reconcile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_stats_reconcile(uuid, uuid) TO service_role;