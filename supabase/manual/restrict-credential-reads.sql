-- Run manually against the LIVE production project (rihgzkofoxcjljlbvbya).
-- Restricts reads of API keys and webhook endpoints to workspace owners/admins.

DROP POLICY IF EXISTS api_keys_select_members ON public.api_keys;
DROP POLICY IF EXISTS webhook_endpoints_select_members ON public.webhook_endpoints;

DROP POLICY IF EXISTS api_keys_select_admins ON public.api_keys;
CREATE POLICY api_keys_select_admins ON public.api_keys
FOR SELECT TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

DROP POLICY IF EXISTS webhook_endpoints_select_admins ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_select_admins ON public.webhook_endpoints
FOR SELECT TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
