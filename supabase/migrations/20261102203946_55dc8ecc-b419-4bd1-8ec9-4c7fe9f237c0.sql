BEGIN;

DROP POLICY IF EXISTS "billing_providers readable" ON public.billing_providers;

CREATE POLICY "billing_providers admin read"
  ON public.billing_providers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

COMMIT;