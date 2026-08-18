-- Normalised engagement events: one row per real provider event, deduped by
-- the provider's own event id so a webhook retry can never double count.
CREATE TABLE IF NOT EXISTS public.email_engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.campaign_messages(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  recipient_email text,
  event_type text NOT NULL,
  provider text,
  provider_message_id text,
  external_id text UNIQUE,
  url text,
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_engagement_events TO authenticated;
GRANT ALL ON public.email_engagement_events TO service_role;

ALTER TABLE public.email_engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read engagement events" ON public.email_engagement_events;
CREATE POLICY "Members read engagement events"
ON public.email_engagement_events
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS email_engagement_ws_time
  ON public.email_engagement_events (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_engagement_ws_type_time
  ON public.email_engagement_events (workspace_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_engagement_campaign
  ON public.email_engagement_events (campaign_id, event_type);
CREATE INDEX IF NOT EXISTS email_engagement_account
  ON public.email_engagement_events (sending_account_id, event_type);

-- ---------------------------------------------------------------- summary
CREATE OR REPLACE FUNCTION public.analytics_summary(
  _workspace_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
  sent bigint,
  delivered bigint,
  opens bigint,
  clicks bigint,
  replies bigint,
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
  SELECT
    (SELECT count(*) FROM public.campaign_messages m
       WHERE m.workspace_id = _workspace_id AND m.status = 'sent'
         AND m.sent_at >= _from AND m.sent_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
       FROM public.email_engagement_events e
       WHERE e.workspace_id = _workspace_id AND e.event_type = 'delivered'
         AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
       FROM public.email_engagement_events e
       WHERE e.workspace_id = _workspace_id AND e.event_type = 'opened'
         AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
       FROM public.email_engagement_events e
       WHERE e.workspace_id = _workspace_id AND e.event_type = 'clicked'
         AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(r.lead_id::text, r.from_email))
       FROM public.campaign_replies r
       WHERE r.workspace_id = _workspace_id
         AND r.received_at >= _from AND r.received_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
       FROM public.email_engagement_events e
       WHERE e.workspace_id = _workspace_id AND e.event_type = 'bounced'
         AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
       FROM public.email_engagement_events e
       WHERE e.workspace_id = _workspace_id AND e.event_type = 'unsubscribed'
         AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
       FROM public.email_engagement_events e
       WHERE e.workspace_id = _workspace_id AND e.event_type = 'complained'
         AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(*) FROM public.campaign_messages m
       WHERE m.workspace_id = _workspace_id AND m.status = 'failed'
         AND m.updated_at >= _from AND m.updated_at < _to);
END;
$$;

-- ------------------------------------------------------------- timeseries
CREATE OR REPLACE FUNCTION public.analytics_timeseries(
  _workspace_id uuid,
  _from timestamptz,
  _to timestamptz,
  _bucket text DEFAULT 'day'
)
RETURNS TABLE(
  bucket timestamptz,
  sent bigint,
  delivered bigint,
  opens bigint,
  clicks bigint,
  replies bigint,
  bounced bigint,
  unsubscribed bigint
)
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
    SELECT generate_series(date_trunc(unit, _from), date_trunc(unit, _to), ('1 ' || unit)::interval) AS bucket
  ),
  sends AS (
    SELECT date_trunc(unit, m.sent_at) AS bucket, count(*) AS n
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id AND m.status = 'sent'
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY 1
  ),
  events AS (
    SELECT date_trunc(unit, e.occurred_at) AS bucket, e.event_type,
           count(DISTINCT coalesce(e.message_id::text, e.recipient_email)) AS n
    FROM public.email_engagement_events e
    WHERE e.workspace_id = _workspace_id
      AND e.occurred_at >= _from AND e.occurred_at < _to
    GROUP BY 1, 2
  ),
  reps AS (
    SELECT date_trunc(unit, r.received_at) AS bucket,
           count(DISTINCT coalesce(r.lead_id::text, r.from_email)) AS n
    FROM public.campaign_replies r
    WHERE r.workspace_id = _workspace_id
      AND r.received_at >= _from AND r.received_at < _to
    GROUP BY 1
  )
  SELECT s.bucket,
         coalesce(sn.n, 0),
         coalesce((SELECT n FROM events e WHERE e.bucket = s.bucket AND e.event_type = 'delivered'), 0),
         coalesce((SELECT n FROM events e WHERE e.bucket = s.bucket AND e.event_type = 'opened'), 0),
         coalesce((SELECT n FROM events e WHERE e.bucket = s.bucket AND e.event_type = 'clicked'), 0),
         coalesce(rp.n, 0),
         coalesce((SELECT n FROM events e WHERE e.bucket = s.bucket AND e.event_type = 'bounced'), 0),
         coalesce((SELECT n FROM events e WHERE e.bucket = s.bucket AND e.event_type = 'unsubscribed'), 0)
  FROM series s
  LEFT JOIN sends sn ON sn.bucket = s.bucket
  LEFT JOIN reps rp ON rp.bucket = s.bucket
  ORDER BY s.bucket;
END;
$$;

-- --------------------------------------------------------- by campaign
CREATE OR REPLACE FUNCTION public.analytics_by_campaign(
  _workspace_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
  campaign_id uuid,
  campaign_name text,
  status text,
  sent bigint,
  delivered bigint,
  opens bigint,
  clicks bigint,
  replies bigint,
  bounced bigint,
  unsubscribed bigint
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
  SELECT c.id, c.name, c.status::text,
    (SELECT count(*) FROM public.campaign_messages m
      WHERE m.campaign_id = c.id AND m.status = 'sent'
        AND m.sent_at >= _from AND m.sent_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.campaign_id = c.id AND e.event_type = 'delivered'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.campaign_id = c.id AND e.event_type = 'opened'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.campaign_id = c.id AND e.event_type = 'clicked'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(r.lead_id::text, r.from_email))
      FROM public.campaign_replies r
      WHERE r.campaign_id = c.id
        AND r.received_at >= _from AND r.received_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.campaign_id = c.id AND e.event_type = 'bounced'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.campaign_id = c.id AND e.event_type = 'unsubscribed'
        AND e.occurred_at >= _from AND e.occurred_at < _to)
  FROM public.campaigns c
  WHERE c.workspace_id = _workspace_id
  ORDER BY 4 DESC, c.created_at DESC;
END;
$$;

-- ---------------------------------------------------------- by mailbox
CREATE OR REPLACE FUNCTION public.analytics_by_account(
  _workspace_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
  account_id uuid,
  from_email text,
  sent bigint,
  delivered bigint,
  opens bigint,
  clicks bigint,
  replies bigint,
  bounced bigint,
  unsubscribed bigint
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
  SELECT a.id, a.from_email,
    (SELECT count(*) FROM public.campaign_messages m
      WHERE m.sending_account_id = a.id AND m.status = 'sent'
        AND m.sent_at >= _from AND m.sent_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.sending_account_id = a.id AND e.event_type = 'delivered'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.sending_account_id = a.id AND e.event_type = 'opened'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.sending_account_id = a.id AND e.event_type = 'clicked'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(r.lead_id::text, r.from_email))
      FROM public.campaign_replies r
      WHERE r.sending_account_id = a.id
        AND r.received_at >= _from AND r.received_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.sending_account_id = a.id AND e.event_type = 'bounced'
        AND e.occurred_at >= _from AND e.occurred_at < _to),
    (SELECT count(DISTINCT coalesce(e.message_id::text, e.recipient_email))
      FROM public.email_engagement_events e
      WHERE e.sending_account_id = a.id AND e.event_type = 'unsubscribed'
        AND e.occurred_at >= _from AND e.occurred_at < _to)
  FROM public.sending_accounts a
  WHERE a.workspace_id = _workspace_id
  ORDER BY 3 DESC, a.from_email;
END;
$$;

-- ---------------------------------------- CRM: bulk stage moves (RLS safe)
CREATE OR REPLACE FUNCTION public.move_crm_contacts(
  _lead_ids uuid[],
  _stage_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ws uuid;
  stage_name text;
  moved integer;
BEGIN
  IF _lead_ids IS NULL OR array_length(_lead_ids, 1) IS NULL THEN RETURN 0; END IF;

  SELECT s.workspace_id, s.name INTO ws, stage_name
  FROM public.crm_stages s WHERE s.id = _stage_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  IF NOT public.is_workspace_member(ws, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = ANY(_lead_ids) AND l.workspace_id IS DISTINCT FROM ws
  ) THEN
    RAISE EXCEPTION 'One or more contacts belong to another workspace';
  END IF;

  UPDATE public.leads
  SET stage_id = _stage_id, last_activity_at = now()
  WHERE id = ANY(_lead_ids) AND workspace_id = ws;
  GET DIAGNOSTICS moved = ROW_COUNT;

  INSERT INTO public.lead_activities (lead_id, workspace_id, type, detail)
  SELECT l.id, ws, 'stage_changed', 'Moved to ' || stage_name
  FROM public.leads l WHERE l.id = ANY(_lead_ids) AND l.workspace_id = ws;

  RETURN moved;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamptz, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_crm_contacts(uuid[], uuid) FROM anon;

ALTER TABLE public.email_engagement_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_engagement_events;
ALTER TABLE public.campaign_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_messages;
ALTER TABLE public.campaign_replies REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_replies;