-- Lead status breakdown: a lead whose step 1 was sent/delivered but whose
-- later follow-up failed was counted as "Failed", hiding the earlier
-- successful send. "Failed" now only applies when nothing for that lead
-- was ever sent. Bounces still win. Read-only report function; no data changes.
-- Run once in the production SQL editor.
DO $migration$
DECLARE
  d text;
  old_rec text := 'SELECT m.recipient_id, max(m.rank) AS rank';
  old_lead text := 'SELECT m.lead_id, max(m.rank) AS rank';
BEGIN
  d := pg_get_functiondef('public.campaign_page_summary(uuid, timestamptz)'::regprocedure);
  IF position(old_rec IN d) = 0 OR position(old_lead IN d) = 0 THEN
    RAISE EXCEPTION 'campaign_page_summary does not match the expected version; nothing changed';
  END IF;
  d := replace(d, old_rec,
    'SELECT m.recipient_id, CASE WHEN max(m.rank) = 10 THEN coalesce(max(m.rank) FILTER (WHERE m.rank BETWEEN 2 AND 9), 10) ELSE max(m.rank) END AS rank');
  d := replace(d, old_lead,
    'SELECT m.lead_id, CASE WHEN max(m.rank) = 10 THEN coalesce(max(m.rank) FILTER (WHERE m.rank BETWEEN 2 AND 9), 10) ELSE max(m.rank) END AS rank');
  EXECUTE d;
END
$migration$;
