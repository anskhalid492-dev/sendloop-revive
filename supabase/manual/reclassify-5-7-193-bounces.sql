-- NOT RUN. Proposed, reversible reclassification of historical 550 5.7.193
-- send failures as Bounced (reporting fields only). Review before running.
-- Requires approval. Run each step separately in the SQL Editor.

-- STEP 1 (read-only): inspect candidates. Only rows whose STORED SMTP response
-- carries the exact 5.7.193 code with a 5xx reply, never unknown-outcome holds.
select id, campaign_id, to_email, updated_at, left(last_error, 200) as last_error
from public.campaign_messages
where status = 'failed'
  and sent_at is null
  and bounced_at is null
  and last_error ~ '(^|[^0-9.])5\.7\.193([^0-9.]|$)'
  and last_error ~ '(^|[^0-9.])5[0-9]{2}([^0-9.]|$)'
  and last_error !~* 'send_outcome_unknown'
order by updated_at;

-- STEP 2 (backup for rollback): keep the exact ids and prior values.
-- create table public.reclass_5_7_193_backup as
--   select id, delivery_status, bounced_at, bounce_reason, now() as backed_up_at
--   from public.campaign_messages where <same WHERE as step 1>;

-- STEP 3 (apply): only reporting fields; status, attempts and retries unchanged;
-- no suppression or lead changes.
-- update public.campaign_messages m
--    set bounced_at = m.updated_at, delivery_status = 'bounced', bounce_reason = left(m.last_error, 500)
--   from public.reclass_5_7_193_backup b
--  where m.id = b.id and m.bounced_at is null;

-- ROLLBACK:
-- update public.campaign_messages m
--    set bounced_at = b.bounced_at, delivery_status = b.delivery_status, bounce_reason = b.bounce_reason
--   from public.reclass_5_7_193_backup b where m.id = b.id;
