-- NOT RUN. Adds the "Interested" CRM stage (between Replied and Meeting Booked).
-- Run manually against PRODUCTION in the SQL Editor after approval.
-- Additive: no stage, contact or history is deleted; contacts keep their stage.

BEGIN;

-- 1. New workspaces get all seven stages.
CREATE OR REPLACE FUNCTION public.ensure_crm_stages(_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_workspace_member(_workspace_id, auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.workspaces w
       WHERE w.id = _workspace_id AND w.owner_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  INSERT INTO public.crm_stages (workspace_id, key, name, color, position, is_won, is_lost)
  VALUES
    (_workspace_id, 'new',            'New',            'slate',   0, false, false),
    (_workspace_id, 'contacted',      'Contacted',      'blue',    1, false, false),
    (_workspace_id, 'replied',        'Replied',        'violet',  2, false, false),
    (_workspace_id, 'interested',     'Interested',     'blue',    3, false, false),
    (_workspace_id, 'meeting_booked', 'Meeting Booked', 'amber',   4, false, false),
    (_workspace_id, 'won',            'Won',            'emerald', 5, true,  false),
    (_workspace_id, 'lost',           'Lost',           'rose',    6, false, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$$;

-- 2. Existing workspaces without an Interested stage: make room right after
--    their Replied stage (only stages after it shift by one), then insert it.
WITH missing AS (
  SELECT r.workspace_id, r.position AS replied_pos
  FROM public.crm_stages r
  WHERE r.key = 'replied'
    AND NOT EXISTS (SELECT 1 FROM public.crm_stages i WHERE i.workspace_id = r.workspace_id AND i.key = 'interested')
)
UPDATE public.crm_stages s
   SET position = s.position + 1
  FROM missing m
 WHERE s.workspace_id = m.workspace_id AND s.position > m.replied_pos;

INSERT INTO public.crm_stages (workspace_id, key, name, color, position, is_won, is_lost)
SELECT r.workspace_id, 'interested', 'Interested', 'blue', r.position + 1, false, false
FROM public.crm_stages r
WHERE r.key = 'replied'
ON CONFLICT (workspace_id, key) DO NOTHING;

COMMIT;

-- Verify (read-only):
-- select workspace_id, string_agg(key, ' > ' order by position) from public.crm_stages group by 1 limit 20;

-- ROLLBACK (only if no contact has been moved into Interested yet):
-- select count(*) from public.leads l join public.crm_stages s on s.id = l.stage_id where s.key = 'interested';  -- must be 0
-- then: delete the 'interested' rows and subtract 1 from positions above the Replied stage per workspace.
