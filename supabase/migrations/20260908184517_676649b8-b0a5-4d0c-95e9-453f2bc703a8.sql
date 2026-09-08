CREATE OR REPLACE FUNCTION public.campaign_overview_rollup(_workspace_id uuid)
RETURNS TABLE(
  campaign_id uuid, leads bigint, sent bigint, sent_today bigint, bounced bigint,
  failed bigint, replies bigint, positive_replies bigint, meetings bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH scope AS (
    SELECT c.id FROM public.campaigns c WHERE c.workspace_id = _workspace_id
  )
  SELECT s.id,
    coalesce((SELECT count(*) FROM public.campaign_recipients r WHERE r.campaign_id = s.id), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.status::text = 'sent'), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.status::text = 'sent' AND m.sent_at >= date_trunc('day', now())), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.bounced_at IS NOT NULL), 0)::bigint,
    coalesce((SELECT count(*) FROM public.campaign_messages m WHERE m.campaign_id = s.id AND m.status::text = 'failed' AND m.bounced_at IS NULL), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(r.lead_id::text, lower(r.from_email))) FROM public.campaign_replies r WHERE r.campaign_id = s.id), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(r.lead_id::text, lower(r.from_email))) FROM public.campaign_replies r WHERE r.campaign_id = s.id AND r.sentiment = 'positive'), 0)::bigint,
    coalesce((SELECT count(DISTINCT coalesce(v.lead_id::text, lower(v.prospect_email))) FROM public.conversations v WHERE v.campaign_id = s.id AND v.status::text IN ('meeting_booked','meeting_completed')), 0)::bigint
  FROM scope s;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_overview_rollup(uuid) TO authenticated, service_role;