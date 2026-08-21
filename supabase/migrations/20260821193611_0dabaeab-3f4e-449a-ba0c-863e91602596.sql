CREATE OR REPLACE FUNCTION public.analytics_summary(
  _workspace_id uuid, _from timestamptz, _to timestamptz
)
RETURNS TABLE(sent bigint, delivered bigint, opens bigint, clicks bigint,
              replies bigint, bounced bigint, unsubscribed bigint,
              complained bigint, failed bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    count(*) FILTER (WHERE m.sent_at IS NOT NULL),
    count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL),
    count(*) FILTER (WHERE m.opened_at IS NOT NULL),
    count(*) FILTER (WHERE m.clicked_at IS NOT NULL),
    count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL),
    count(*) FILTER (WHERE m.bounced_at IS NOT NULL),
    count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL),
    count(*) FILTER (WHERE m.complained_at IS NOT NULL),
    count(*) FILTER (WHERE m.bounced_at IS NULL AND (m.failed_at IS NOT NULL OR m.delivery_status = 'failed'))
  FROM public.campaign_messages m
  WHERE m.workspace_id = _workspace_id
    AND coalesce(m.sent_at, m.updated_at) >= _from
    AND coalesce(m.sent_at, m.updated_at) < _to
    AND (m.sent_at IS NOT NULL OR m.status = 'failed')
    AND public.is_workspace_member(_workspace_id, auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.analytics_by_campaign(
  _workspace_id uuid, _from timestamptz, _to timestamptz
)
RETURNS TABLE(campaign_id uuid, campaign_name text, status text, sent bigint,
              delivered bigint, opens bigint, clicks bigint, replies bigint,
              bounced bigint, unsubscribed bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT m.campaign_id AS cid,
      count(*) FILTER (WHERE m.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL) AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL) AS opens,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL) AS clicks,
      count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL) AS replies,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY m.campaign_id
  )
  SELECT c.id, c.name, c.status::text,
         coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM public.campaigns c
  LEFT JOIN agg a ON a.cid = c.id
  WHERE c.workspace_id = _workspace_id
  ORDER BY 4 DESC, c.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_by_account(
  _workspace_id uuid, _from timestamptz, _to timestamptz
)
RETURNS TABLE(account_id uuid, from_email text, sent bigint, delivered bigint,
              opens bigint, clicks bigint, replies bigint, bounced bigint,
              unsubscribed bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT m.sending_account_id AS aid,
      count(*) FILTER (WHERE m.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL) AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL) AS opens,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL) AS clicks,
      count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL) AS replies,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY m.sending_account_id
  )
  SELECT sa.id, sa.from_email,
         coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM public.sending_accounts sa
  LEFT JOIN agg a ON a.aid = sa.id
  WHERE sa.workspace_id = _workspace_id
  ORDER BY 3 DESC, sa.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_timeseries(
  _workspace_id uuid, _from timestamptz, _to timestamptz, _bucket text DEFAULT 'day'
)
RETURNS TABLE(bucket timestamptz, sent bigint, delivered bigint, opens bigint,
              clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  unit text := CASE WHEN _bucket = 'hour' THEN 'hour' ELSE 'day' END;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH series AS (
    SELECT generate_series(date_trunc(unit, _from), date_trunc(unit, _to), ('1 ' || unit)::interval) AS b
  ),
  agg AS (
    SELECT date_trunc(unit, m.sent_at) AS b,
      count(*) AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL) AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL) AS opens,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL) AS clicks,
      count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL) AS replies,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY 1
  )
  SELECT s.b, coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM series s LEFT JOIN agg a ON a.b = s.b
  ORDER BY s.b;
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_delivery_state(_workspace_id uuid DEFAULT NULL, _since timestamptz DEFAULT now() - interval '30 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  touched integer := 0;
BEGIN
  WITH ev AS (
    SELECT e.message_id,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'delivered')    AS delivered_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'opened')       AS opened_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'clicked')      AS clicked_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'bounced')      AS bounced_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'complained')   AS complained_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'unsubscribed') AS unsubscribed_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'failed')       AS failed_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'replied')      AS replied_at,
      max(e.occurred_at)                                              AS last_event_at
    FROM public.email_engagement_events e
    WHERE e.message_id IS NOT NULL
      AND e.occurred_at >= _since
      AND (_workspace_id IS NULL OR e.workspace_id = _workspace_id)
    GROUP BY e.message_id
  ),
  upd AS (
    UPDATE public.campaign_messages m
    SET delivered_at    = coalesce(m.delivered_at, ev.delivered_at),
        opened_at       = coalesce(m.opened_at, ev.opened_at),
        clicked_at      = coalesce(m.clicked_at, ev.clicked_at),
        bounced_at      = coalesce(m.bounced_at, ev.bounced_at),
        complained_at   = coalesce(m.complained_at, ev.complained_at),
        unsubscribed_at = coalesce(m.unsubscribed_at, ev.unsubscribed_at),
        failed_at       = coalesce(m.failed_at, ev.failed_at),
        replied_at      = coalesce(m.replied_at, ev.replied_at),
        last_event_at   = greatest(coalesce(m.last_event_at, ev.last_event_at), ev.last_event_at),
        delivery_status = CASE
          WHEN coalesce(m.bounced_at, ev.bounced_at) IS NOT NULL THEN 'bounced'
          WHEN coalesce(m.failed_at, ev.failed_at) IS NOT NULL THEN 'failed'
          WHEN coalesce(m.complained_at, ev.complained_at) IS NOT NULL THEN 'complained'
          WHEN coalesce(m.unsubscribed_at, ev.unsubscribed_at) IS NOT NULL THEN 'unsubscribed'
          WHEN coalesce(m.replied_at, ev.replied_at) IS NOT NULL THEN 'replied'
          WHEN coalesce(m.clicked_at, ev.clicked_at) IS NOT NULL THEN 'clicked'
          WHEN coalesce(m.opened_at, ev.opened_at) IS NOT NULL THEN 'opened'
          WHEN coalesce(m.delivered_at, ev.delivered_at) IS NOT NULL THEN 'delivered'
          ELSE m.delivery_status END,
        reconciled_at = now()
    FROM ev
    WHERE m.id = ev.message_id
      AND (
        (m.delivered_at IS NULL AND ev.delivered_at IS NOT NULL) OR
        (m.opened_at IS NULL AND ev.opened_at IS NOT NULL) OR
        (m.clicked_at IS NULL AND ev.clicked_at IS NOT NULL) OR
        (m.bounced_at IS NULL AND ev.bounced_at IS NOT NULL) OR
        (m.complained_at IS NULL AND ev.complained_at IS NOT NULL) OR
        (m.unsubscribed_at IS NULL AND ev.unsubscribed_at IS NOT NULL) OR
        (m.failed_at IS NULL AND ev.failed_at IS NOT NULL) OR
        (m.replied_at IS NULL AND ev.replied_at IS NOT NULL)
      )
    RETURNING 1
  )
  SELECT count(*) INTO touched FROM upd;

  UPDATE public.campaign_messages m
  SET replied_at = r.received_at,
      last_event_at = greatest(coalesce(m.last_event_at, r.received_at), r.received_at)
  FROM public.campaign_replies r
  WHERE r.message_id = m.id
    AND m.replied_at IS NULL
    AND r.received_at >= _since
    AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id);

  UPDATE public.campaign_messages m
  SET status = 'failed'
  WHERE m.status = 'sent'
    AND (m.bounced_at IS NOT NULL OR m.failed_at IS NOT NULL)
    AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id);

  RETURN touched;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.repair_delivery_state(uuid, timestamptz) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_delivery_state(uuid, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) TO authenticated;