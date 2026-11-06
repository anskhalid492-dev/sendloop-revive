-- PROPOSED (NOT RUN). Relabel 6 historical failed campaign sends as Bounced.
-- Audit (read-only, 2026-11-06): these are the only failed rows whose stored
-- receiving-server reply is a confirmed permanent recipient-side rejection.
--   75873d31-65d4-454d-9b70-44ae5d693b77  550 5.4.1
--   81dcbf09-1d76-460b-b513-bd831b0165fb  550 5.4.1
--   e4bee4d8-c99d-45a9-8d1e-ad2d5c8e6f5f  550 5.4.1 Recipient address rejected: Access denied
--   31474c6a-53c3-4a43-be71-10b45372b175  552
--   33208b26-75e5-4504-8b03-116eb811f330  552 5.2.0
--   3430a3ee-701a-40fb-bf2e-19a0c959dec8  550 5.7.1_ETR (already a named bounce rule)
-- Changes reporting fields only: no deletes, no resends, last_error / sent_at /
-- failed_at / provider ids untouched. Idempotent: re-running changes nothing.
-- bounced_at uses the original failure time, so date windows stay correct.

begin;

-- STEP 1: private backup (fresh name; RLS on, no API access)
create table if not exists public.reclass_permanent_smtp_backup_2026_11 (
  id uuid primary key, status text, delivery_status text, bounced_at timestamptz,
  bounce_reason text, backed_up_at timestamptz default now()
);
alter table public.reclass_permanent_smtp_backup_2026_11 enable row level security;
revoke all on public.reclass_permanent_smtp_backup_2026_11 from anon, authenticated;

insert into public.reclass_permanent_smtp_backup_2026_11 (id, status, delivery_status, bounced_at, bounce_reason)
select id, status, delivery_status, bounced_at, bounce_reason
from public.campaign_messages
where id in ('75873d31-65d4-454d-9b70-44ae5d693b77','81dcbf09-1d76-460b-b513-bd831b0165fb',
             'e4bee4d8-c99d-45a9-8d1e-ad2d5c8e6f5f','31474c6a-53c3-4a43-be71-10b45372b175',
             '33208b26-75e5-4504-8b03-116eb811f330','3430a3ee-701a-40fb-bf2e-19a0c959dec8')
  and status = 'failed' and bounced_at is null
on conflict (id) do nothing;

-- STEP 2: apply (only rows still failed + unbounced + matching the audited reply)
update public.campaign_messages m
   set bounced_at = coalesce(m.failed_at, m.updated_at),
       delivery_status = 'bounced',
       bounce_reason = left(m.last_error, 500)
  from public.reclass_permanent_smtp_backup_2026_11 b
 where m.id = b.id and m.status = 'failed' and m.bounced_at is null
   and m.last_error ~ '^(550 5\.4\.1|552|550 5\.7\.1_ETR)';

-- STEP 3: verify — expect 6 rows, delivery_status = bounced
select id, final_to_email, last_error, delivery_status, bounced_at
from public.campaign_messages
where id in (select id from public.reclass_permanent_smtp_backup_2026_11);

commit;

-- ROLLBACK (manual):
-- update public.campaign_messages m
--    set bounced_at = b.bounced_at, delivery_status = b.delivery_status, bounce_reason = b.bounce_reason
--   from public.reclass_permanent_smtp_backup_2026_11 b where m.id = b.id;
