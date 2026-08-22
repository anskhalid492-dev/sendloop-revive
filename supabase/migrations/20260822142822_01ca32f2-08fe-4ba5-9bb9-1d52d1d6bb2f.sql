-- 1. Internal-only routines: remove execute rights from visitors and signed-in users
REVOKE EXECUTE ON FUNCTION public.consume_workspace_usage(uuid, text, date, bigint, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_workspace_usage(uuid, text, date, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provider_record_usage(uuid, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_workspace_activity(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_workspace_owner_member() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ensure_crm_stages(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon;

-- 2. Billing tables are populated only by trusted server code
REVOKE INSERT, UPDATE, DELETE ON public.billing_customers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_invoices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_transactions FROM anon, authenticated;
GRANT ALL ON public.billing_customers, public.billing_subscriptions, public.billing_invoices, public.billing_transactions TO service_role;

-- 3. Invitations are created/accepted only through the vetted helper routines
REVOKE INSERT, UPDATE, DELETE ON public.workspace_invitations FROM anon, authenticated;
GRANT SELECT ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;

-- 4. Support notes: block edits/removals so staff-only notes cannot be flipped
REVOKE UPDATE, DELETE ON public.support_ticket_messages FROM anon, authenticated;
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;

-- 5. Blog media bucket stays private: drop the world-readable rule
DROP POLICY IF EXISTS "Anyone can read blog media objects" ON storage.objects;