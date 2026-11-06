-- PROPOSED (NOT RUN). Relabel 32 historical failed campaign sends as Bounced.
-- Audit (read-only, 2026-11-06): these are the only failed rows whose stored
-- receiving-server reply is a confirmed permanent recipient-side rejection.
--   75873d31-65d4-454d-9b70-44ae5d693b77  550 5.4.1
--   81dcbf09-1d76-460b-b513-bd831b0165fb  550 5.4.1
--   e4bee4d8-c99d-45a9-8d1e-ad2d5c8e6f5f  550 5.4.1 Recipient address rejected: Access denied
--   31474c6a-53c3-4a43-be71-10b45372b175  552
--   33208b26-75e5-4504-8b03-116eb811f330  552 5.2.0
--   3430a3ee-701a-40fb-bf2e-19a0c959dec8  550 5.7.1_ETR (already a named bounce rule)
--   + 26 rows whose stored reply is exactly "550" (owner decision: bare 550 = bounce)
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
             '33208b26-75e5-4504-8b03-116eb811f330','3430a3ee-701a-40fb-bf2e-19a0c959dec8',
             '0fee4ea3-2111-44bf-8e5b-78c276a9111f','121687d3-9bd0-4c41-a401-4c40b1f11088','18ea03a0-18e6-4575-b8cc-d34e16390c95','2d72020a-f01a-4e04-8b03-0b2be6a7bfb1','2fa7ee44-8e86-4379-89dc-b7343b6529a9','3489ba14-5ec9-440b-aba8-67e10b5986b3','39abec65-8ab1-4b48-86b5-eb60c0dcf5f3','3b7bcc9c-88ff-480f-af4f-785f825fb1e7','4c7167d6-ae5e-4fe6-8435-f992711f1675','5785bb89-4c2a-4d24-bb41-d2bdd5bfd45c','5cf9bcc4-6ac9-4346-afa7-fdcd0ea1d6fe','65bd432b-f1af-43a9-ab9c-13097bb35b8b','6d24712d-4b5a-437f-a746-4254f8d83fe1','72b1fa26-68ce-4ef7-9e5f-df33268a8529','77af08e3-9b0e-4f86-9644-ae2c5ca895f4','8290edb5-95b0-4812-b237-3f1319c27837','86708b47-c3da-46f0-80c9-7e2e593c8d22','9c962876-e050-4957-ad36-687663bf2b17','a2f287e4-3f71-4df3-b90a-bfee8a49f723','ac31c6cc-51e6-482d-9bda-e60791a726d1','b5f3202a-e286-4846-8a4d-8a03dc9dcf14','cee5ec7c-1016-4c3e-b9d4-a654b0bbc672','d3d49372-4fc0-4156-aeb9-18b314995ca4','e83af83a-6266-44da-abe3-f059acf442a9','f821d270-4300-4924-8375-f6bda0c9849f','fc277840-1bf2-4df2-9885-0a8786b85336')
  and status = 'failed' and bounced_at is null
on conflict (id) do nothing;

-- STEP 2: apply (only rows still failed + unbounced + matching the audited reply)
update public.campaign_messages m
   set bounced_at = coalesce(m.failed_at, m.updated_at),
       delivery_status = 'bounced',
       bounce_reason = left(m.last_error, 500)
  from public.reclass_permanent_smtp_backup_2026_11 b
 where m.id = b.id and m.status = 'failed' and m.bounced_at is null
   and (m.last_error ~ '^(550 5\.4\.1|552|550 5\.7\.1_ETR)' or btrim(m.last_error) = '550');

-- STEP 3: verify — expect 32 rows, delivery_status = bounced
select id, final_to_email, last_error, delivery_status, bounced_at
from public.campaign_messages
where id in (select id from public.reclass_permanent_smtp_backup_2026_11);

commit;

-- ROLLBACK (manual):
-- update public.campaign_messages m
--    set bounced_at = b.bounced_at, delivery_status = b.delivery_status, bounce_reason = b.bounce_reason
--   from public.reclass_permanent_smtp_backup_2026_11 b where m.id = b.id;
