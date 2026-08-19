-- Webhook health log: every billing webhook request, verified or not.
CREATE TABLE public.referral_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'unknown',
  event_id text,
  event_type text,
  signature_ok boolean NOT NULL DEFAULT false,
  status_code integer NOT NULL DEFAULT 200,
  result text,
  error text,
  source_ip_hash text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_webhook_events_received_idx ON public.referral_webhook_events (received_at DESC);

GRANT SELECT ON public.referral_webhook_events TO authenticated;
GRANT ALL ON public.referral_webhook_events TO service_role;
ALTER TABLE public.referral_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform staff can read referral webhook events"
ON public.referral_webhook_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

-- Referral notification preference (defaults on, like other categories).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS referral_updates boolean NOT NULL DEFAULT true;

-- Realtime for the referral dashboards.
ALTER TABLE public.referral_clicks REPLICA IDENTITY FULL;
ALTER TABLE public.referral_attributions REPLICA IDENTITY FULL;
ALTER TABLE public.referral_commissions REPLICA IDENTITY FULL;
ALTER TABLE public.referral_payouts REPLICA IDENTITY FULL;
ALTER TABLE public.referral_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.referral_fraud_flags REPLICA IDENTITY FULL;
ALTER TABLE public.referral_webhook_events REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['referral_clicks','referral_attributions','referral_commissions','referral_payouts','referral_profiles','referral_fraud_flags','referral_webhook_events'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;