DROP FUNCTION IF EXISTS public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.analytics_by_campaign(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone)
RETURNS TABLE(
  campaign_id uuid,
  campaign_name text,
  status text,
  sent bigint,
  delivered bigint,
  opens bigint,
  clicks bigint,
  replies bigint,
  positive_replies bigint,
  bounced bigint,
  unsubscribed bigint,
  complained bigint,
  failed bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH sent AS (
    SELECT m.campaign_id AS cid, count(*)::bigint AS sent
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY m.campaign_id
  ), delivered AS (
    SELECT m.campaign_id AS cid, count(*)::bigint AS delivered
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
      AND m.delivered_at >= _from AND m.delivered_at < _to
      AND m.bounced_at IS NULL
      AND m.failed_at IS NULL
    GROUP BY m.campaign_id
  ), engagement AS (
    SELECT e.campaign_id AS cid,
      count(DISTINCT e.message_id) FILTER (WHERE e.event_type IN ('open', 'opened'))::bigint AS opens,
      count(DISTINCT coalesce(e.message_id::text, e.external_id)) FILTER (WHERE e.event_type IN ('click', 'clicked'))::bigint AS clicks
    FROM public.email_engagement_events e
    WHERE e.workspace_id = _workspace_id
      AND e.occurred_at >= _from AND e.occurred_at < _to
      AND e.campaign_id IS NOT NULL
    GROUP BY e.campaign_id
  ), replies AS (
    SELECT r.campaign_id AS cid,
      count(DISTINCT coalesce(r.lead_id::text, r.from_email, r.id::text))::bigint AS replies,
      count(DISTINCT coalesce(r.lead_id::text, r.from_email, r.id::text)) FILTER (WHERE r.sentiment = 'positive')::bigint AS positive_replies
    FROM public.campaign_replies r
    WHERE r.workspace_id = _workspace_id
      AND r.received_at >= _from AND r.received_at < _to
      AND r.campaign_id IS NOT NULL
    GROUP BY r.campaign_id
  ), outcomes AS (
    SELECT m.campaign_id AS cid,
      count(*) FILTER (WHERE m.bounced_at >= _from AND m.bounced_at < _to)::bigint AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at >= _from AND m.unsubscribed_at < _to)::bigint AS unsubscribed,
      count(*) FILTER (WHERE m.complained_at >= _from AND m.complained_at < _to)::bigint AS complained,
      count(*) FILTER (WHERE m.failed_at >= _from AND m.failed_at < _to OR (m.status = 'failed' AND m.updated_at >= _from AND m.updated_at < _to))::bigint AS failed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
    GROUP BY m.campaign_id
  )
  SELECT c.id, c.name, c.status::text,
         coalesce(s.sent, 0), coalesce(d.delivered, 0), coalesce(e.opens, 0),
         coalesce(e.clicks, 0), coalesce(r.replies, 0), coalesce(r.positive_replies, 0),
         coalesce(o.bounced, 0), coalesce(o.unsubscribed, 0), coalesce(o.complained, 0),
         coalesce(o.failed, 0)
  FROM public.campaigns c
  LEFT JOIN sent s ON s.cid = c.id
  LEFT JOIN delivered d ON d.cid = c.id
  LEFT JOIN engagement e ON e.cid = c.id
  LEFT JOIN replies r ON r.cid = c.id
  LEFT JOIN outcomes o ON o.cid = c.id
  WHERE c.workspace_id = _workspace_id
  ORDER BY 4 DESC, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

DROP FUNCTION IF EXISTS public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.analytics_by_account(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone)
RETURNS TABLE(account_id uuid, from_email text, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH sent AS (
    SELECT m.sending_account_id AS aid, count(*)::bigint AS sent
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY m.sending_account_id
  ), delivered AS (
    SELECT m.sending_account_id AS aid, count(*)::bigint AS delivered
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
      AND m.delivered_at >= _from AND m.delivered_at < _to
      AND m.bounced_at IS NULL
      AND m.failed_at IS NULL
    GROUP BY m.sending_account_id
  ), engagement AS (
    SELECT e.sending_account_id AS aid,
      count(DISTINCT e.message_id) FILTER (WHERE e.event_type IN ('open', 'opened'))::bigint AS opens,
      count(DISTINCT coalesce(e.message_id::text, e.external_id)) FILTER (WHERE e.event_type IN ('click', 'clicked'))::bigint AS clicks
    FROM public.email_engagement_events e
    WHERE e.workspace_id = _workspace_id
      AND e.occurred_at >= _from AND e.occurred_at < _to
      AND e.sending_account_id IS NOT NULL
    GROUP BY e.sending_account_id
  ), replies AS (
    SELECT r.sending_account_id AS aid,
      count(DISTINCT coalesce(r.lead_id::text, r.from_email, r.id::text))::bigint AS replies
    FROM public.campaign_replies r
    WHERE r.workspace_id = _workspace_id
      AND r.received_at >= _from AND r.received_at < _to
      AND r.sending_account_id IS NOT NULL
    GROUP BY r.sending_account_id
  ), outcomes AS (
    SELECT m.sending_account_id AS aid,
      count(*) FILTER (WHERE m.bounced_at >= _from AND m.bounced_at < _to)::bigint AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at >= _from AND m.unsubscribed_at < _to)::bigint AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.message_type = 'campaign'
    GROUP BY m.sending_account_id
  )
  SELECT sa.id, sa.from_email,
         coalesce(s.sent, 0), coalesce(d.delivered, 0), coalesce(e.opens, 0),
         coalesce(e.clicks, 0), coalesce(r.replies, 0), coalesce(o.bounced, 0),
         coalesce(o.unsubscribed, 0)
  FROM public.sending_accounts sa
  LEFT JOIN sent s ON s.aid = sa.id
  LEFT JOIN delivered d ON d.aid = sa.id
  LEFT JOIN engagement e ON e.aid = sa.id
  LEFT JOIN replies r ON r.aid = sa.id
  LEFT JOIN outcomes o ON o.aid = sa.id
  WHERE sa.workspace_id = _workspace_id
  ORDER BY 3 DESC, sa.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

DROP FUNCTION IF EXISTS public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.analytics_summary(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone)
RETURNS TABLE(sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint, complained bigint, failed bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH authz AS (
    SELECT public.is_workspace_member(_workspace_id, auth.uid()) AS ok
  ), sent AS (
    SELECT count(*)::bigint AS sent
    FROM public.campaign_messages m, authz
    WHERE authz.ok AND m.workspace_id = _workspace_id AND m.message_type = 'campaign'
      AND m.sent_at >= _from AND m.sent_at < _to
  ), delivered AS (
    SELECT count(*)::bigint AS delivered
    FROM public.campaign_messages m, authz
    WHERE authz.ok AND m.workspace_id = _workspace_id AND m.message_type = 'campaign'
      AND m.delivered_at >= _from AND m.delivered_at < _to
      AND m.bounced_at IS NULL AND m.failed_at IS NULL
  ), engagement AS (
    SELECT
      count(DISTINCT e.message_id) FILTER (WHERE e.event_type IN ('open', 'opened'))::bigint AS opens,
      count(DISTINCT coalesce(e.message_id::text, e.external_id)) FILTER (WHERE e.event_type IN ('click', 'clicked'))::bigint AS clicks
    FROM public.email_engagement_events e, authz
    WHERE authz.ok AND e.workspace_id = _workspace_id
      AND e.occurred_at >= _from AND e.occurred_at < _to
  ), replies AS (
    SELECT count(DISTINCT coalesce(r.lead_id::text, r.from_email, r.id::text))::bigint AS replies
    FROM public.campaign_replies r, authz
    WHERE authz.ok AND r.workspace_id = _workspace_id
      AND r.received_at >= _from AND r.received_at < _to
  ), outcomes AS (
    SELECT
      count(*) FILTER (WHERE m.bounced_at >= _from AND m.bounced_at < _to)::bigint AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at >= _from AND m.unsubscribed_at < _to)::bigint AS unsubscribed,
      count(*) FILTER (WHERE m.complained_at >= _from AND m.complained_at < _to)::bigint AS complained,
      count(*) FILTER (WHERE m.failed_at >= _from AND m.failed_at < _to OR (m.status = 'failed' AND m.updated_at >= _from AND m.updated_at < _to))::bigint AS failed
    FROM public.campaign_messages m, authz
    WHERE authz.ok AND m.workspace_id = _workspace_id AND m.message_type = 'campaign'
  )
  SELECT s.sent, d.delivered, e.opens, e.clicks, r.replies, o.bounced, o.unsubscribed, o.complained, o.failed
  FROM sent s CROSS JOIN delivered d CROSS JOIN engagement e CROSS JOIN replies r CROSS JOIN outcomes o;
$$;

REVOKE ALL ON FUNCTION public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

DROP FUNCTION IF EXISTS public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text);

CREATE FUNCTION public.analytics_timeseries(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone, _bucket text DEFAULT 'day'::text)
RETURNS TABLE(bucket timestamp with time zone, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit text := CASE WHEN _bucket = 'hour' THEN 'hour' ELSE 'day' END;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH series AS (
    SELECT generate_series(date_trunc(unit, _from), date_trunc(unit, _to), ('1 ' || unit)::interval) AS b
  ), events AS (
    SELECT date_trunc(unit, m.sent_at) AS b, 1::bigint AS sent, 0::bigint AS delivered, 0::bigint AS opens, 0::bigint AS clicks, 0::bigint AS replies, 0::bigint AS bounced, 0::bigint AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id AND m.message_type = 'campaign' AND m.sent_at >= _from AND m.sent_at < _to
    UNION ALL
    SELECT date_trunc(unit, m.delivered_at), 0, 1, 0, 0, 0, 0, 0
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id AND m.message_type = 'campaign' AND m.delivered_at >= _from AND m.delivered_at < _to AND m.bounced_at IS NULL AND m.failed_at IS NULL
    UNION ALL
    SELECT date_trunc(unit, e.occurred_at), 0, 0, count(DISTINCT e.message_id), 0, 0, 0, 0
    FROM public.email_engagement_events e
    WHERE e.workspace_id = _workspace_id AND e.event_type IN ('open', 'opened') AND e.occurred_at >= _from AND e.occurred_at < _to
    GROUP BY 1
    UNION ALL
    SELECT date_trunc(unit, e.occurred_at), 0, 0, 0, count(DISTINCT coalesce(e.message_id::text, e.external_id)), 0, 0, 0
    FROM public.email_engagement_events e
    WHERE e.workspace_id = _workspace_id AND e.event_type IN ('click', 'clicked') AND e.occurred_at >= _from AND e.occurred_at < _to
    GROUP BY 1
    UNION ALL
    SELECT date_trunc(unit, r.received_at), 0, 0, 0, 0, count(DISTINCT coalesce(r.lead_id::text, r.from_email, r.id::text)), 0, 0
    FROM public.campaign_replies r
    WHERE r.workspace_id = _workspace_id AND r.received_at >= _from AND r.received_at < _to
    GROUP BY 1
    UNION ALL
    SELECT date_trunc(unit, m.bounced_at), 0, 0, 0, 0, 0, 1, 0
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id AND m.message_type = 'campaign' AND m.bounced_at >= _from AND m.bounced_at < _to
    UNION ALL
    SELECT date_trunc(unit, m.unsubscribed_at), 0, 0, 0, 0, 0, 0, 1
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id AND m.message_type = 'campaign' AND m.unsubscribed_at >= _from AND m.unsubscribed_at < _to
  ), agg AS (
    SELECT events.b,
      sum(events.sent)::bigint AS sent,
      sum(events.delivered)::bigint AS delivered,
      sum(events.opens)::bigint AS opens,
      sum(events.clicks)::bigint AS clicks,
      sum(events.replies)::bigint AS replies,
      sum(events.bounced)::bigint AS bounced,
      sum(events.unsubscribed)::bigint AS unsubscribed
    FROM events
    GROUP BY events.b
  )
  SELECT s.b, coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM series s LEFT JOIN agg a ON a.b = s.b
  ORDER BY s.b;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text) TO service_role;