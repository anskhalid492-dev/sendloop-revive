REVOKE ALL ON FUNCTION public.admin_audit_log_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_security_events_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_admin_permission(uuid, text) FROM PUBLIC, anon;