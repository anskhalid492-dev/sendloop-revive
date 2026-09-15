DROP POLICY IF EXISTS "members_update_admin" ON public.workspace_members;
CREATE POLICY "members_update_admin" ON public.workspace_members
FOR UPDATE TO authenticated
USING (
  has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
  AND role <> 'owner'::workspace_role
  AND (
    user_id <> auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  )
)
WITH CHECK (
  has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
  AND role <> 'owner'::workspace_role
  AND (
    user_id <> auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "members_insert_admin" ON public.workspace_members;
CREATE POLICY "members_insert_admin" ON public.workspace_members
FOR INSERT TO authenticated
WITH CHECK (
  (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  )
  OR (
    has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
    AND role <> 'owner'::workspace_role
  )
);

DROP POLICY IF EXISTS "Members delete lead notes" ON public.lead_notes;
CREATE POLICY "Members delete lead notes" ON public.lead_notes
FOR DELETE TO authenticated
USING (
  is_workspace_member(workspace_id, auth.uid())
  AND (
    author_id = auth.uid()
    OR has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role, 'campaign_manager'::workspace_role])
  )
);