-- 1. Guarantee every workspace owner is a member of their own workspace.
CREATE OR REPLACE FUNCTION public.ensure_workspace_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_ensure_owner_member ON public.workspaces;
CREATE TRIGGER workspaces_ensure_owner_member
AFTER INSERT OR UPDATE OF owner_id ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.ensure_workspace_owner_member();

-- Backfill orphaned owners.
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
FROM public.workspaces w
WHERE w.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
  );

-- 2. Tighten the campaign_recipients INSERT policy: caller must manage the
--    workspace AND the campaign and lead must belong to that same workspace.
DROP POLICY IF EXISTS campaign_recipients_insert ON public.campaign_recipients;
CREATE POLICY campaign_recipients_insert
ON public.campaign_recipients
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_role(
    workspace_id, auth.uid(),
    ARRAY['owner','admin','campaign_manager']::workspace_role[]
  )
  AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_recipients.campaign_id
      AND c.workspace_id = campaign_recipients.workspace_id
  )
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = campaign_recipients.lead_id
      AND l.workspace_id = campaign_recipients.workspace_id
  )
);