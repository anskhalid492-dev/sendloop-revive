-- =============================================================================
-- MunchReach: align legacy statistics RPCs with the shared message outcomes
-- (src/lib/message-outcomes.ts). NOT APPLIED. Owner runs manually, after review.
--
-- Rules (identical to the app):
--   * Accepted is never Confirmed Delivered; delivered needs delivered_at.
--   * Bounced = a SENT email (sent_at set) with a recorded bounce. A cancelled,
--     never-sent follow-up is never a bounce (even with cancelled_reason =
--     'recipient_bounced').
--   * Held for review (attempts >= 999 or last_error like
--     '%send_outcome_unknown%') is never Failed and never retryable.
--   * Failed = definitive failures only (not bounced, not held).
--
-- Read-only/statistics functions only. Same names, arguments and return types,
-- so nothing that calls them breaks. No table rows are read-modified or deleted.
-- The app already overlays the canonical counts, so these changes only keep
-- the database summaries consistent for any other consumer.
--
-- ROLLBACK: the previous definitions are captured by step 0 below. To restore,
-- run the saved definition text from public._outcome_rpc_backup_2026_11.
-- =============================================================================

begin;

-- 0) Keep the current definitions so this is reversible.
create table if not exists public._outcome_rpc_backup_2026_11 (
  proname text primary key,
  definition text not null,
  saved_at timestamptz not null default now()
);
alter table public._outcome_rpc_backup_2026_11 enable row level security;
revoke all on public._outcome_rpc_backup_2026_11 from anon, authenticated;
insert into public._outcome_rpc_backup_2026_11 (proname, definition)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('campaign_overview_rollup', 'analytics_summary', 'analytics_by_campaign')
on conflict (proname) do nothing;

-- 1) Campaign list rollup.
create or replace function public.campaign_overview_rollup(_workspace_id uuid)
 returns table(campaign_id uuid, leads bigint, sent bigint, contacted bigint, sent_today bigint, bounced bigint, failed bigint, replies bigint, positive_replies bigint, meetings bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  with scope as (
    select c.id from public.campaigns c where c.workspace_id = _workspace_id
  )
  select s.id,
    coalesce((select count(*) from public.campaign_recipients r where r.campaign_id = s.id), 0)::bigint,
    -- Accepted by the mail server, ever (distinct message ids).
    coalesce((select count(*) from public.campaign_messages m where m.campaign_id = s.id and m.sent_at is not null), 0)::bigint,
    coalesce((select count(distinct coalesce(m.recipient_id::text, m.lead_id::text, m.id::text))
      from public.campaign_messages m
      where m.campaign_id = s.id and m.sent_at is not null), 0)::bigint,
    coalesce((select count(*) from public.campaign_messages m where m.campaign_id = s.id and m.sent_at >= date_trunc('day', now())), 0)::bigint,
    -- Bounced: sent emails with a recorded bounce only (never cancelled follow-ups).
    coalesce((select count(*) from public.campaign_messages m
      where m.campaign_id = s.id and m.sent_at is not null
        and (m.bounced_at is not null or m.delivery_status = 'bounced')), 0)::bigint,
    -- Failed: definitive only; held-for-review is excluded.
    coalesce((select count(*) from public.campaign_messages m
      where m.campaign_id = s.id and m.status::text = 'failed'
        and m.bounced_at is null and coalesce(m.delivery_status, '') <> 'bounced'
        and coalesce(m.attempts, 0) < 999
        and coalesce(m.last_error, '') not ilike '%send_outcome_unknown%'), 0)::bigint,
    coalesce((select count(distinct coalesce(r.lead_id::text, lower(r.from_email))) from public.campaign_replies r where r.campaign_id = s.id), 0)::bigint,
    coalesce((select count(distinct coalesce(r.lead_id::text, lower(r.from_email))) from public.campaign_replies r where r.campaign_id = s.id and r.sentiment = 'positive'), 0)::bigint,
    coalesce((select count(distinct coalesce(v.lead_id::text, lower(v.prospect_email))) from public.conversations v where v.campaign_id = s.id and v.status::text in ('meeting_booked','meeting_completed')), 0)::bigint
  from scope s;
$function$;

-- 2) Workspace analytics summary.
create or replace function public.analytics_summary(_workspace_id uuid, _from timestamptz, _to timestamptz)
 returns table(sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint, complained bigint, failed bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    count(*) filter (where m.sent_at is not null),
    count(*) filter (where m.delivered_at is not null and m.sent_at is not null and m.bounced_at is null and m.failed_at is null),
    count(*) filter (where m.opened_at is not null),
    count(*) filter (where m.clicked_at is not null),
    count(distinct m.lead_id) filter (where m.replied_at is not null),
    count(*) filter (where m.sent_at is not null and (m.bounced_at is not null or m.delivery_status = 'bounced')),
    count(*) filter (where m.unsubscribed_at is not null),
    count(*) filter (where m.complained_at is not null),
    count(*) filter (where m.bounced_at is null and coalesce(m.delivery_status, '') <> 'bounced'
      and (m.failed_at is not null or m.delivery_status = 'failed' or m.status = 'failed')
      and coalesce(m.attempts, 0) < 999
      and coalesce(m.last_error, '') not ilike '%send_outcome_unknown%')
  from public.campaign_messages m
  where m.workspace_id = _workspace_id
    and coalesce(m.sent_at, m.failed_at) >= _from
    and coalesce(m.sent_at, m.failed_at) < _to
    and public.is_workspace_member(_workspace_id, auth.uid());
$function$;

-- 3) Per-campaign analytics.
create or replace function public.analytics_by_campaign(_workspace_id uuid, _from timestamptz, _to timestamptz)
 returns table(campaign_id uuid, campaign_name text, status text, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(_workspace_id, auth.uid()) then
    raise exception 'Not authorized for this workspace';
  end if;

  return query
  with agg as (
    select m.campaign_id as cid,
      count(*) filter (where m.sent_at is not null) as sent,
      count(*) filter (where m.delivered_at is not null and m.bounced_at is null and m.failed_at is null) as delivered,
      count(*) filter (where m.opened_at is not null) as opens,
      count(*) filter (where m.clicked_at is not null) as clicks,
      count(distinct m.lead_id) filter (where m.replied_at is not null) as replies,
      count(*) filter (where m.bounced_at is not null or m.delivery_status = 'bounced') as bounced,
      count(*) filter (where m.unsubscribed_at is not null) as unsubscribed
    from public.campaign_messages m
    where m.workspace_id = _workspace_id
      and m.sent_at >= _from and m.sent_at < _to
    group by m.campaign_id
  )
  select c.id, c.name, c.status::text,
         coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  from public.campaigns c
  left join agg a on a.cid = c.id
  where c.workspace_id = _workspace_id
  order by 4 desc, c.created_at desc;
end;
$function$;

commit;

-- VERIFY (read-only) for campaign 623e4dbb-11ac-4c36-be68-04e0a8da5e95:
-- Expect bounced = sent emails with a bounce marker only, failed = 0, and the
-- held IDs absent from failed.
-- select r.* from public.campaign_overview_rollup(
--   (select workspace_id from public.campaigns where id = '623e4dbb-11ac-4c36-be68-04e0a8da5e95')
-- ) r where r.campaign_id = '623e4dbb-11ac-4c36-be68-04e0a8da5e95';
--
-- NOTE: campaign_page_summary is not changed here. The app no longer reads its
-- outcome, lead-state or retryable numbers (it overlays the shared calculation),
-- and only uses it for recipient/progress inventory.
