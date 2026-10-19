-- Relabel 2 historical failed sends as Bounced (reporting fields only).
-- Rows: als@antelecom.net (554 READ), info@gardensoftheworld.info (550 permanent).
-- Status, retries, suppression and leads are unchanged. Run in the SQL Editor.

-- STEP 1: backup for rollback
create table if not exists public.reclass_554_550_backup as
  select id, delivery_status, bounced_at, bounce_reason, now() as backed_up_at
  from public.campaign_messages
  where id in ('652e0685-097c-4636-bf09-6edf73201484','3cd8a7f0-7f15-46b8-a0c2-451c43066c80')
    and bounced_at is null;

-- STEP 2: apply
update public.campaign_messages m
   set bounced_at = m.updated_at, delivery_status = 'bounced', bounce_reason = left(m.last_error, 500)
  from public.reclass_554_550_backup b
 where m.id = b.id and m.bounced_at is null;

-- STEP 3: verify (expect 2 rows, delivery_status = bounced)
select id, to_email, delivery_status, bounced_at, last_error
from public.campaign_messages
where id in ('652e0685-097c-4636-bf09-6edf73201484','3cd8a7f0-7f15-46b8-a0c2-451c43066c80');

-- ROLLBACK (only if needed):
-- update public.campaign_messages m
--    set bounced_at = b.bounced_at, delivery_status = b.delivery_status, bounce_reason = b.bounce_reason
--   from public.reclass_554_550_backup b where m.id = b.id;
