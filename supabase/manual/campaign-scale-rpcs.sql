-- =====================================================================
-- MunchReach — campaign scale RPCs. IDEMPOTENT. Safe to re-run.
--
-- Run this against the LIVE database that munchreach.com talks to.
-- It creates no tables, drops nothing, and touches no campaign history.
-- It only (re)defines read-only aggregate functions and adds indexes.
--
-- Fixes: PGRST202 "function not found in schema cache" for
--   campaign_page_summary, campaign_eligible_lead_count,
--   campaign_ai_missing_count, campaign_stats, campaign_overview_rollup
-- which surfaced in the app as a generic "Internal server error".
-- =====================================================================

-- Prerequisite: run supabase/manual/cancelled-reason.sql first — these
-- aggregates read campaign_messages.cancelled_reason.

-- Indexes these aggregates rely on (all IF NOT EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS campaign_messages_recipient_step_uniq
  ON public.campaign_messages (campaign_id, recipient_id, step_order);
CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_status_idx
  ON public.campaign_recipients (campaign_id, status, current_step);
CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_lead_idx
  ON public.campaign_recipients (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS campaign_messages_campaign_step_idx
  ON public.campaign_messages (campaign_id, step_order);
CREATE INDEX IF NOT EXISTS campaign_messages_campaign_sent_idx
  ON public.campaign_messages (campaign_id, sent_at);
CREATE INDEX IF NOT EXISTS leads_list_status_idx
  ON public.leads (list_id, status);

CREATE OR REPLACE FUNCTION public.campaign_ai_missing_count(_campaign_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT (
    SELECT count(*)::bigint FROM public.campaign_recipients r
    WHERE r.campaign_id = _campaign_id
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_personalizations a
        WHERE a.campaign_id = _campaign_id AND a.lead_id = r.lead_id AND a.status = 'completed'
      )
  ) + (
    SELECT count(*)::bigint
    FROM public.campaigns c
    JOIN public.leads l ON l.list_id = c.list_id AND l.status = 'new'
    WHERE c.id = _campaign_id AND c.list_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_recipients r
        WHERE r.campaign_id = c.id AND r.lead_id = l.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_personalizations a
        WHERE a.campaign_id = c.id AND a.lead_id = l.id AND a.status = 'completed'
      )
  );
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_ai_missing_count(_campaign_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_eligible_lead_count(_campaign_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::bigint
  FROM public.campaigns c
  JOIN public.leads l ON l.list_id = c.list_id AND l.status = 'new'
  WHERE c.id = _campaign_id
    AND c.list_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_recipients r
      WHERE r.campaign_id = c.id AND r.lead_id = l.id
    );
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_eligible_lead_count(_campaign_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_eligible_leads(_campaign_id uuid, _after uuid DEFAULT NULL::uuid, _limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, company text, job_title text, country text, city text, state text, website text, phone text, linkedin_url text, custom_fields jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT l.id, l.email, l.first_name, l.last_name, l.company, l.job_title,
         l.country, l.city, l.state, l.website, l.phone, l.linkedin_url,
         l.custom_fields
  FROM public.campaigns c
  JOIN public.leads l ON l.list_id = c.list_id AND l.status = 'new'
  WHERE c.id = _campaign_id
    AND c.list_id IS NOT NULL
    AND (_after IS NULL OR l.id > _after)
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_recipients r
      WHERE r.campaign_id = c.id AND r.lead_id = l.id
    )
  ORDER BY l.id
  LIMIT least(greatest(_limit, 1), 1000);
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_eligible_leads(_campaign_id uuid, _after uuid, _limit integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_overview_rollup(_workspace_id uuid)
 RETURNS TABLE(campaign_id uuid, leads bigint, sent bigint, sent_today bigint, bounced bigint, failed bigint, replies bigint, positive_replies bigint, meetings bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT c.id FROM public.campaigns c WHERE c.workspace_id = _workspace_id
  )
  SELECT s.id,
    coalesce((SELECT count(*) FROM public.campaign_recipients r WHERE r.campaign_id = s.id), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.status::text = 'sent'), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.status::text = 'sent' AND m.sent_at >= date_trunc('day', now())), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(m.recipient_id::text, m.lead_id::text, m.id::text))
      FROM public.campaign_messages m
      WHERE m.campaign_id = s.id
        AND (m.bounced_at IS NOT NULL OR m.cancelled_reason = 'recipient_bounced')), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.status::text = 'failed' AND m.bounced_at IS NULL), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(r.lead_id::text, lower(r.from_email))) FROM public.campaign_replies r WHERE r.campaign_id = s.id), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(r.lead_id::text, lower(r.from_email))) FROM public.campaign_replies r WHERE r.campaign_id = s.id AND r.sentiment = 'positive'), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(v.lead_id::text, lower(v.prospect_email))) FROM public.conversations v WHERE v.campaign_id = s.id AND v.status::text IN ('meeting_booked','meeting_completed')), 0)::bigint
  FROM scope s;
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_overview_rollup(_workspace_id uuid) TO authenticated, service_role;

-- SECURITY DEFINER on purpose. As SECURITY INVOKER this function ran under the
-- row-level policies of `campaign_recipients` / `campaign_messages`, which call
-- is_workspace_member() per row: ~4k recipients x N steps => statement timeout
-- (57014) in production, while the same query as owner finished in 784 ms.
-- Access is enforced once, explicitly, at the top of the body instead.
CREATE OR REPLACE FUNCTION public.campaign_page_summary(_campaign_id uuid, _day_start timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _workspace_id uuid;
  _result jsonb;
BEGIN
  SELECT c.workspace_id INTO _workspace_id FROM public.campaigns c WHERE c.id = _campaign_id;
  IF _workspace_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT (public.is_workspace_member(_workspace_id, auth.uid())
            OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'not authorized for this campaign' USING ERRCODE = '42501';
    END IF;
  ELSIF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    -- No JWT and not a trusted backend role: refuse.
    RAISE EXCEPTION 'not authorized for this campaign' USING ERRCODE = '42501';
  END IF;

  SELECT (
WITH msg AS MATERIALIZED (
  SELECT
    m.id,
    m.recipient_id,
    m.lead_id,
    m.step_order,
    m.status::text AS status,
    m.delivery_status,
    m.scheduled_at,
    m.sent_at,
    m.delivered_at,
    m.delayed_at,
    m.opened_at,
    m.clicked_at,
    m.replied_at,
    m.bounced_at,
    m.complained_at,
    m.unsubscribed_at,
    m.failed_at,
    m.cancelled_reason,
    (coalesce(m.last_error, '') !~* '(hard\s*bounce|permanent|invalid\s*(recipient|address|email|destination)|no\s*such\s*(user|mailbox|recipient)|mailbox\s*(does\s*not\s*exist|unavailable)|address\s*rejected|recipient\s*(suppressed|blocked|blacklisted)|suppress|unsubscrib|complaint|5\.[17]\.[0-9]+|domain\s*(not\s*found|does\s*not\s*exist)|account\s*disabled|message\s*rejected)') AS soft_retryable,
    (coalesce(m.last_error, '') !~* '(hard\s*bounce|permanent|invalid\s*(recipient|address|email|destination)|no\s*such\s*(user|mailbox|recipient)|address\s*rejected|suppress|unsubscrib|complaint|5\.[17]\.[0-9]+|domain\s*(not\s*found|does\s*not\s*exist)|account\s*disabled|message\s*rejected)') AS soft_owed,
    CASE
      WHEN m.bounced_at IS NOT NULL OR m.delivery_status = 'bounced'
        OR m.cancelled_reason = 'recipient_bounced' THEN 11
      WHEN m.failed_at IS NOT NULL OR m.status::text = 'failed' THEN 10
      WHEN m.cancelled_reason = 'recipient_complained' THEN 9
      WHEN m.cancelled_reason = 'recipient_unsubscribed' THEN 8
      WHEN m.status::text = 'cancelled' THEN 0
      WHEN m.sent_at IS NULL THEN 1
      WHEN m.complained_at IS NOT NULL THEN 9
      WHEN m.unsubscribed_at IS NOT NULL THEN 8
      WHEN m.replied_at IS NOT NULL THEN 7
      WHEN m.clicked_at IS NOT NULL THEN 6
      WHEN m.opened_at IS NOT NULL THEN 5
      WHEN m.delivered_at IS NOT NULL THEN 4
      WHEN m.delayed_at IS NOT NULL THEN 3
      ELSE 2
    END AS rank
  FROM public.campaign_messages m
  WHERE m.campaign_id = _campaign_id

), rec AS (
  SELECT r.id, r.lead_id, r.status::text AS status
  FROM public.campaign_recipients r
  WHERE r.campaign_id = _campaign_id
), msg_rank_by_recipient AS (
  SELECT m.recipient_id, max(m.rank) AS rank
  FROM msg m
  WHERE m.recipient_id IS NOT NULL
  GROUP BY m.recipient_id
), legacy_msg_rank_by_lead AS (
  SELECT m.lead_id, max(m.rank) AS rank
  FROM msg m
  WHERE m.recipient_id IS NULL AND m.lead_id IS NOT NULL
  GROUP BY m.lead_id
), rec_rank AS (
  SELECT r.id,
    greatest(coalesce(mr.rank, 0), coalesce(lr.rank, 0)) AS rank
  FROM rec r
  LEFT JOIN msg_rank_by_recipient mr ON mr.recipient_id = r.id
  LEFT JOIN legacy_msg_rank_by_lead lr ON lr.lead_id = r.lead_id
), lead_states AS (
  SELECT CASE coalesce(rank, 0)
    WHEN 0 THEN 'not_contacted' WHEN 1 THEN 'queued' WHEN 2 THEN 'sent'
    WHEN 3 THEN 'delayed' WHEN 4 THEN 'delivered' WHEN 5 THEN 'opened'
    WHEN 6 THEN 'clicked' WHEN 7 THEN 'replied' WHEN 8 THEN 'unsubscribed'
    WHEN 9 THEN 'complained' WHEN 10 THEN 'failed' ELSE 'bounced' END AS state,
    count(*)::bigint AS n
  FROM rec_rank GROUP BY 1
), by_step AS (
  SELECT m.step_order AS step,
    count(*) FILTER (WHERE m.sent_at IS NOT NULL)::bigint AS sent,
    count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL)::bigint AS delivered,
    count(*) FILTER (WHERE m.opened_at IS NOT NULL)::bigint AS opened,
    count(*) FILTER (WHERE m.replied_at IS NOT NULL)::bigint AS replied,
    count(*) FILTER (WHERE m.sent_at IS NULL AND m.status::text IN ('pending','scheduled','queued'))::bigint AS scheduled
  FROM msg m GROUP BY m.step_order
)
SELECT jsonb_build_object(
  'recipients', (
    SELECT jsonb_build_object(
      'total', count(*)::bigint,
      'pending', count(*) FILTER (WHERE status = 'pending')::bigint,
      'in_progress', count(*) FILTER (WHERE status = 'in_progress')::bigint,
      'completed', count(*) FILTER (WHERE status = 'completed')::bigint,
      'replied', count(*) FILTER (WHERE status = 'replied')::bigint,
      'bounced', count(*) FILTER (WHERE status = 'bounced')::bigint,
      'unsubscribed', count(*) FILTER (WHERE status = 'unsubscribed')::bigint,
      'failed', count(*) FILTER (WHERE status = 'failed')::bigint,
      'stopped', count(*) FILTER (WHERE status = 'stopped')::bigint
    ) FROM rec
  ),
  'lead_states', coalesce((SELECT jsonb_object_agg(state, n) FROM lead_states), '{}'::jsonb),
  'delivery', (
    SELECT jsonb_build_object(
      'sent', count(*) FILTER (WHERE sent_at IS NOT NULL)::bigint,
      'delivered', count(*) FILTER (WHERE delivered_at IS NOT NULL AND bounced_at IS NULL AND delivery_status IS DISTINCT FROM 'failed')::bigint,
      'delayed', count(*) FILTER (WHERE delayed_at IS NOT NULL AND delivered_at IS NULL AND bounced_at IS NULL)::bigint,
      'opened', count(*) FILTER (WHERE opened_at IS NOT NULL)::bigint,
      'clicked', count(*) FILTER (WHERE clicked_at IS NOT NULL)::bigint,
      'replied', count(DISTINCT coalesce(lead_id::text, id::text)) FILTER (WHERE replied_at IS NOT NULL)::bigint,
      -- Counted per PERSON, and a recipient whose remaining mail was cancelled
      -- because of a bounce/unsubscribe/complaint still counts. Mirrors
      -- countOutcomeRecipients() in src/lib/cancellation-reason.ts.
      'bounced', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text))
        FILTER (WHERE bounced_at IS NOT NULL OR cancelled_reason = 'recipient_bounced')::bigint,
      'complained', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text))
        FILTER (WHERE complained_at IS NOT NULL OR cancelled_reason = 'recipient_complained')::bigint,
      'unsubscribed', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text))
        FILTER (WHERE unsubscribed_at IS NOT NULL OR cancelled_reason = 'recipient_unsubscribed')::bigint,
      'failed', count(*) FILTER (WHERE bounced_at IS NULL AND (failed_at IS NOT NULL OR status::text = 'failed'))::bigint,
      'scheduled', count(*) FILTER (WHERE sent_at IS NULL AND status::text IN ('pending','scheduled','queued'))::bigint,
      'sending', count(*) FILTER (WHERE sent_at IS NULL AND status::text = 'processing')::bigint,
      'cancelled', count(*) FILTER (WHERE status::text = 'cancelled')::bigint,
      'contacted', count(DISTINCT lead_id) FILTER (WHERE sent_at IS NOT NULL)::bigint
    ) FROM msg
  ),
  'today', (
    SELECT jsonb_build_object(
      'sent', count(*) FILTER (WHERE sent_at >= _day_start)::bigint,
      'delivered', count(*) FILTER (WHERE delivered_at >= _day_start AND bounced_at IS NULL AND delivery_status IS DISTINCT FROM 'failed')::bigint,
      'opened', count(*) FILTER (WHERE opened_at >= _day_start)::bigint,
      'clicked', count(*) FILTER (WHERE clicked_at >= _day_start)::bigint,
      'replied', count(*) FILTER (WHERE replied_at >= _day_start)::bigint,
      'bounced', count(*) FILTER (WHERE bounced_at >= _day_start)::bigint,
      'failed', count(*) FILTER (WHERE failed_at >= _day_start AND bounced_at IS NULL)::bigint
    ) FROM msg
  ),
  'by_step', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'step', step, 'sent', sent, 'delivered', delivered,
      'opened', opened, 'replied', replied, 'scheduled', scheduled) ORDER BY step)
    FROM by_step), '[]'::jsonb),
  'next_pending_at', (
    SELECT min(scheduled_at) FROM msg
    WHERE sent_at IS NULL AND status::text IN ('pending','scheduled','queued')
  ),
  'retryable_failures', (
    SELECT count(*)::bigint FROM msg
    WHERE status = 'failed' AND sent_at IS NULL AND bounced_at IS NULL AND soft_retryable
  ),
  'owed_messages', (
    SELECT count(*)::bigint FROM msg
    WHERE status IN ('pending','scheduled','processing','queued')
      OR (status = 'failed' AND sent_at IS NULL AND soft_owed)
  )
)
  ) INTO _result;

  RETURN _result;
END;
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_page_summary(_campaign_id uuid, _day_start timestamp with time zone) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_recipients_missing_first_message(_campaign_id uuid, _after uuid DEFAULT NULL::uuid, _limit integer DEFAULT 200)
 RETURNS TABLE(recipient_id uuid, sending_account_id uuid, lead_id uuid, email text, first_name text, last_name text, company text, job_title text, country text, city text, state text, website text, phone text, linkedin_url text, custom_fields jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.sending_account_id, l.id, l.email, l.first_name, l.last_name,
         l.company, l.job_title, l.country, l.city, l.state, l.website,
         l.phone, l.linkedin_url, l.custom_fields
  FROM public.campaign_recipients r
  JOIN public.leads l ON l.id = r.lead_id
  WHERE r.campaign_id = _campaign_id
    AND r.status = 'pending'
    AND r.current_step = 0
    AND (_after IS NULL OR r.id > _after)
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_messages m
      WHERE m.campaign_id = _campaign_id AND m.recipient_id = r.id AND m.step_order = 1
    )
  ORDER BY r.id
  LIMIT least(greatest(_limit, 1), 1000);
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_recipients_missing_first_message(_campaign_id uuid, _after uuid, _limit integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_stats(_workspace_id uuid, _campaign_ids uuid[] DEFAULT NULL::uuid[], _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(campaign_id uuid, campaign_name text, status text, leads bigint, queued bigint, sending bigint, sent bigint, delivered bigint, opened bigint, clicked bigint, replied bigint, positive_replied bigint, bounced bigint, unsubscribed bigint, complained bigint, failed bigint, remaining bigint)
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
      -- Per-person outcomes, including recipients whose remaining mail was
      -- cancelled with the reason attached (see src/lib/cancellation-reason.ts).
      count(DISTINCT coalesce(m.recipient_id::text, m.lead_id::text, m.id::text)) FILTER (
        WHERE (m.bounced_at IS NOT NULL AND m.bounced_at >= lo AND m.bounced_at < hi)
           OR (m.cancelled_reason = 'recipient_bounced' AND m.updated_at >= lo AND m.updated_at < hi)
      )::bigint AS bounced,
      count(DISTINCT coalesce(m.recipient_id::text, m.lead_id::text, m.id::text)) FILTER (
        WHERE (m.unsubscribed_at IS NOT NULL AND m.unsubscribed_at >= lo AND m.unsubscribed_at < hi)
           OR (m.cancelled_reason = 'recipient_unsubscribed' AND m.updated_at >= lo AND m.updated_at < hi)
      )::bigint AS unsubscribed,
      count(DISTINCT coalesce(m.recipient_id::text, m.lead_id::text, m.id::text)) FILTER (
        WHERE (m.complained_at IS NOT NULL AND m.complained_at >= lo AND m.complained_at < hi)
           OR (m.cancelled_reason = 'recipient_complained' AND m.updated_at >= lo AND m.updated_at < hi)
      )::bigint AS complained,
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
$function$
;

GRANT EXECUTE ON FUNCTION public.campaign_stats(_workspace_id uuid, _campaign_ids uuid[], _from timestamp with time zone, _to timestamp with time zone) TO authenticated, service_role;

-- PostgREST must be told to re-read the schema, otherwise the functions stay
-- invisible to the app and keep returning PGRST202.
NOTIFY pgrst, 'reload schema';

-- Verification: this must return 7 rows.
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname IN (
--   'campaign_page_summary','campaign_eligible_lead_count','campaign_eligible_leads',
--   'campaign_ai_missing_count','campaign_stats','campaign_overview_rollup',
--   'campaign_recipients_missing_first_message');

-- Least privilege. Most of these run with the caller's rights (SECURITY
-- INVOKER) so RLS protects them; campaign_page_summary is SECURITY DEFINER and
-- checks workspace membership itself. Either way anon has no business calling
-- them at all.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'campaign_page_summary','campaign_eligible_lead_count','campaign_eligible_leads',
      'campaign_ai_missing_count','campaign_recipients_missing_first_message',
      'campaign_overview_rollup','campaign_stats')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
