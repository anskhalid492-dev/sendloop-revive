-- PROPOSED, NOT APPLIED. Run manually against production only after approval.
-- Prevents concurrent duplicate marketing opens: one row per send per open type.
-- Additive and backward compatible: no data is changed or deleted.

-- 1) Preflight (read-only). Must return 0 rows, otherwise the index cannot be
--    created; existing duplicates are left untouched and must be reviewed.
SELECT metadata->>'send_event_id' AS send_event_id, event_type, count(*)
FROM public.marketing_email_events
WHERE event_type IN ('marketing_email_opened', 'marketing_email_opened_machine')
  AND metadata ? 'send_event_id'
GROUP BY 1, 2 HAVING count(*) > 1 LIMIT 50;

-- 2) Index. The Supabase SQL editor runs statements inside a transaction, where
--    CREATE INDEX CONCURRENTLY is not allowed, so this uses a plain index build.
--    It takes a brief write lock on the table while building.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_email_events_open_once_per_send
  ON public.marketing_email_events (event_type, (metadata->>'send_event_id'))
  WHERE event_type IN ('marketing_email_opened', 'marketing_email_opened_machine')
    AND metadata ? 'send_event_id';

-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS public.marketing_email_events_open_once_per_send;
