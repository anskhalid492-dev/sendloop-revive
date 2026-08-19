REVOKE ALL ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) TO authenticated, service_role;