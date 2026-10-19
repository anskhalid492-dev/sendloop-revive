-- Relabel 1 historical failed send as Bounced: karol@pizza-boy.co.uk (550 No mailbox).
-- STEP 1: backup
create table if not exists public.reclass_550_no_mailbox_backup as
  select id, delivery_status, bounced_at, bounce_reason, now() as backed_up_at
  from public.campaign_messages
  where id = '2b8a744c-75dc-44a6-a3e2-f1199b79eb30' and bounced_at is null;

-- STEP 2: apply
update public.campaign_messages m
   set bounced_at = m.updated_at, delivery_status = 'bounced', bounce_reason = left(m.last_error, 500)
  from public.reclass_550_no_mailbox_backup b
 where m.id = b.id and m.bounced_at is null;

-- STEP 3: verify
select id, to_email, delivery_status, bounced_at
from public.campaign_messages where id = '2b8a744c-75dc-44a6-a3e2-f1199b79eb30';

-- ROLLBACK:
-- update public.campaign_messages m
--    set bounced_at = b.bounced_at, delivery_status = b.delivery_status, bounce_reason = b.bounce_reason
--   from public.reclass_550_no_mailbox_backup b where m.id = b.id;
