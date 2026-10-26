-- PROPOSED, NOT APPLIED. Run manually against production after approval.
-- Analytics consistency fix: open/click/reply rates are per PERSON everywhere.
--
-- What this changes:
--   1. campaign_page_summary: "opened" and "clicked" now count UNIQUE PEOPLE
--      (one contact opening three follow-ups = one open), matching the
--      Analytics page. Before, they counted emails, so the campaign page
--      showed more opens than Analytics.
--   2. campaign_overview_rollup: gains a "contacted" column (unique people
--      emailed), the people-based rate base for the Campaigns list.
--
-- Safe: read-only reporting functions; no data is changed or deleted.
-- The rollup's return type changes, so it is dropped and recreated.
--
-- Verify afterwards (expect opened <= sent, contacted <= leads):
--   SELECT (campaign_page_summary('<campaign-id>'::uuid, now()))->'delivery';
--   SELECT * FROM campaign_overview_rollup('<workspace-id>'::uuid);
--
-- Rollback: re-apply the previous definitions from git history of
-- supabase/manual/campaign-scale-rpcs.sql.

-- The return type gains `contacted` (unique people emailed), which CREATE OR
-- REPLACE cannot do in place, so the old function is dropped first.
DROP FUNCTION IF EXISTS public.campaign_overview_rollup(uuid);
CREATE FUNCTION public.campaign_overview_rollup(_workspace_id uuid)
 RETURNS TABLE(campaign_id uuid, leads bigint, sent bigint, contacted bigint, sent_today bigint, bounced bigint, failed bigint, replies bigint, positive_replies bigint, meetings bigint)
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
    -- Unique people emailed: the people-based rate base, so multi-step
    -- sequences never dilute open/reply rates.
    coalesce((SELECT count(DISTINCT coalesce(m.recipient_id::text, m.lead_id::text, m.id::text))
      FROM public.campaign_messages m
      WHERE m.campaign_id = s.id AND m.sent_at IS NOT NULL), 0)::bigint,
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
      -- Opens and clicks count PEOPLE, like every other surface: one contact
      -- opening three follow-ups is one open, never three.
      'opened', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text)) FILTER (WHERE opened_at IS NOT NULL)::bigint,
      'clicked', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text)) FILTER (WHERE clicked_at IS NOT NULL)::bigint,
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
      'opened', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text)) FILTER (WHERE opened_at >= _day_start)::bigint,
      'clicked', count(DISTINCT coalesce(recipient_id::text, lead_id::text, id::text)) FILTER (WHERE clicked_at >= _day_start)::bigint,
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
