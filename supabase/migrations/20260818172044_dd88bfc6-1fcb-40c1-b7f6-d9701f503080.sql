CREATE OR REPLACE FUNCTION public.ensure_crm_stages(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  INSERT INTO public.crm_stages (workspace_id, key, name, color, position, is_won, is_lost)
  VALUES
    (_workspace_id, 'new',            'New',            'slate',   0, false, false),
    (_workspace_id, 'contacted',      'Contacted',      'blue',    1, false, false),
    (_workspace_id, 'replied',        'Replied',        'violet',  2, false, false),
    (_workspace_id, 'meeting_booked', 'Meeting Booked', 'amber',   3, false, false),
    (_workspace_id, 'won',            'Won',            'emerald', 4, true,  false),
    (_workspace_id, 'lost',           'Lost',           'rose',    5, false, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_crm_stages(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_crm_stage(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_crm_stages(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_crm_stage(uuid, uuid) TO authenticated, service_role;