-- Warmup delivery tracking (additive, rerunnable).
--
-- Adds a normalized per-message delivery state to warmup_jobs so a warmup send
-- can be traced queued → sending → sent → delivered/failed/bounced, whatever
-- provider or mailbox carried it, and recomputes the daily "delivered" counter
-- from real confirmations only.
--
-- Nothing is invented: a job is only marked delivered when evidence exists
-- (arrival event, provider delivery event, reply, or a recorded placement).
-- Sends with no evidence stay "sent" (unconfirmed).

alter table public.warmup_jobs
  add column if not exists delivery_state text not null default 'queued',
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_source text;

create index if not exists warmup_jobs_delivery_state_idx
  on public.warmup_jobs (sending_account_id, delivery_state);
create index if not exists warmup_jobs_delivered_at_idx
  on public.warmup_jobs (sending_account_id, delivered_at);

-- ---------------------------------------------------------------- backfill
-- 1. Confirmed arrivals: a placement was recorded, the message was received,
--    the job reached delivered/replied, or an arrival event exists.
with proof as (
  select j.id,
         coalesce(
           j.received_at,
           j.placement_checked_at,
           (select min(e.occurred_at)
              from public.warmup_events e
             where e.job_id = j.id
               and e.type in ('delivered', 'inbox_placement', 'spam_placement', 'replied')),
           j.processed_at
         ) as at,
         case
           when j.received_at is not null then 'inbound_arrival'
           when exists (select 1 from public.warmup_events e
                         where e.job_id = j.id and e.type = 'delivered') then 'provider_event'
           when exists (select 1 from public.warmup_events e
                         where e.job_id = j.id and e.type = 'replied') then 'peer_reply'
           when j.placement in ('inbox', 'spam', 'received_unknown') then 'placement'
           else 'status'
         end as source
    from public.warmup_jobs j
   where j.delivered_at is null
     and (
       j.received_at is not null
       or j.status in ('delivered', 'replied')
       or j.placement in ('inbox', 'spam', 'received_unknown')
       or exists (select 1 from public.warmup_events e
                   where e.job_id = j.id
                     and e.type in ('delivered', 'inbox_placement', 'spam_placement', 'replied'))
     )
)
update public.warmup_jobs j
   set delivery_state = 'delivered',
       delivered_at = coalesce(proof.at, now()),
       delivered_source = proof.source
  from proof
 where proof.id = j.id;

-- 2. Confirmed negatives.
update public.warmup_jobs j
   set delivery_state = 'bounced'
 where j.delivered_at is null
   and j.delivery_state <> 'bounced'
   and (j.placement = 'not_delivered'
        or exists (select 1 from public.warmup_events e
                    where e.job_id = j.id and e.type = 'bounced'));

update public.warmup_jobs j
   set delivery_state = 'failed'
 where j.delivered_at is null
   and j.delivery_state not in ('bounced', 'failed')
   and j.status = 'failed';

-- 3. Accepted hand-offs with no arrival evidence stay "sent" (unconfirmed).
update public.warmup_jobs j
   set delivery_state = 'sent'
 where j.delivered_at is null
   and j.delivery_state = 'queued'
   and j.status = 'sent';

-- ------------------------------------------- recompute the daily counters
-- Only confirmed arrivals count. Days with no confirmations become 0 rather
-- than keeping an unexplained number.
update public.warmup_daily_stats s
   set delivered = coalesce(c.delivered, 0)
  from (
    select sending_account_id,
           (delivered_at at time zone 'utc')::date as day,
           count(*) as delivered
      from public.warmup_jobs
     where delivered_at is not null
     group by 1, 2
  ) c
 where c.sending_account_id = s.sending_account_id
   and c.day = s.day
   and s.delivered <> coalesce(c.delivered, 0);

update public.warmup_daily_stats s
   set delivered = 0
 where s.delivered <> 0
   and not exists (
     select 1 from public.warmup_jobs j
      where j.sending_account_id = s.sending_account_id
        and j.delivered_at is not null
        and (j.delivered_at at time zone 'utc')::date = s.day
   );
