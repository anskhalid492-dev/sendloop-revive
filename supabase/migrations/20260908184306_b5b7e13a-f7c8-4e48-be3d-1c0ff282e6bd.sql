-- Idempotency: one queued message per recipient per sequence step.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_messages_recipient_step_uniq
  ON public.campaign_messages (campaign_id, recipient_id, step_order)
  WHERE recipient_id IS NOT NULL;

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

-- ---------------------------------------------------------------------------
-- Whole campaign page summary, computed in Postgres.
-- Runs as the caller (RLS applies) so it can never leak another workspace.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_page_summary(
  _campaign_id uuid,
  _day_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
WITH msg AS (
  SELECT m.*,
    CASE
      WHEN m.bounced_at IS NOT NULL OR m.delivery_status = 'bounced' THEN 11
      WHEN m.failed_at IS NOT NULL OR m.status::text = 'failed' THEN 10
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
), rec_rank AS (
  SELECT r.id, max(m.rank) AS rank
  FROM rec r
  LEFT JOIN msg m
    ON m.recipient_id = r.id
    OR (m.recipient_id IS NULL AND m.lead_id = r.lead_id)
  GROUP BY r.id
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
      'bounced', count(*) FILTER (WHERE bounced_at IS NOT NULL)::bigint,
      'complained', count(*) FILTER (WHERE complained_at IS NOT NULL)::bigint,
      'unsubscribed', count(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::bigint,
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
    WHERE status::text = 'failed' AND sent_at IS NULL AND bounced_at IS NULL
      AND coalesce(last_error, '') !~* '(hard\s*bounce|permanent|invalid\s*(recipient|address|email|destination)|no\s*such\s*(user|mailbox|recipient)|mailbox\s*(does\s*not\s*exist|unavailable)|address\s*rejected|recipient\s*(suppressed|blocked|blacklisted)|suppress|unsubscrib|complaint|5\.[17]\.[0-9]+|domain\s*(not\s*found|does\s*not\s*exist)|account\s*disabled|message\s*rejected)'
  ),
  'owed_messages', (
    SELECT count(*)::bigint FROM msg
    WHERE status::text IN ('pending','scheduled','processing','queued')
      OR (status::text = 'failed' AND sent_at IS NULL
          AND coalesce(last_error, '') !~* '(hard\s*bounce|permanent|invalid\s*(recipient|address|email|destination)|no\s*such\s*(user|mailbox|recipient)|address\s*rejected|suppress|unsubscrib|complaint|5\.[17]\.[0-9]+|domain\s*(not\s*found|does\s*not\s*exist)|account\s*disabled|message\s*rejected)')
  )
);
$$;

GRANT EXECUTE ON FUNCTION public.campaign_page_summary(uuid, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leads still eligible to be queued into a campaign: count + keyset page.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_eligible_lead_count(_campaign_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
  FROM public.campaigns c
  JOIN public.leads l ON l.list_id = c.list_id AND l.status = 'new'
  WHERE c.id = _campaign_id
    AND c.list_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_recipients r
      WHERE r.campaign_id = c.id AND r.lead_id = l.id
    );
$$;

GRANT EXECUTE ON FUNCTION public.campaign_eligible_lead_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_eligible_leads(
  _campaign_id uuid,
  _after uuid DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE(
  id uuid, email text, first_name text, last_name text, company text,
  job_title text, country text, city text, state text, website text,
  phone text, linkedin_url text, custom_fields jsonb
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.campaign_eligible_leads(uuid, uuid, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Recipients that are attached but have no first-step message yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_recipients_missing_first_message(
  _campaign_id uuid,
  _after uuid DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE(
  recipient_id uuid, sending_account_id uuid, lead_id uuid, email text,
  first_name text, last_name text, company text, job_title text,
  country text, city text, state text, website text, phone text,
  linkedin_url text, custom_fields jsonb
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.campaign_recipients_missing_first_message(uuid, uuid, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audience members still waiting for AI personalization (hold mode check).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_ai_missing_count(_campaign_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.campaign_ai_missing_count(uuid) TO authenticated, service_role;