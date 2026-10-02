-- Restrict billing_providers reads to platform admins.
-- Non-destructive: no data changes. All app reads of this table use the
-- server admin client, so customers lose nothing.
-- Run in the production SQL editor (project rihgzkofoxcjljlbvbya).

BEGIN;

DROP POLICY IF EXISTS "billing_providers readable" ON public.billing_providers;

CREATE POLICY "billing_providers admin read"
  ON public.billing_providers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMIT;

-- Verify (expect one row: billing_providers admin read):
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'billing_providers';
