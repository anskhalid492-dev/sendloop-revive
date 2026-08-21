-- Per-message delivery state so campaign metrics come from real provider events.
ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS delivery_detail text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE INDEX IF NOT EXISTS campaign_messages_provider_message_id_idx
  ON public.campaign_messages (provider_message_id);
CREATE INDEX IF NOT EXISTS campaign_messages_campaign_delivery_idx
  ON public.campaign_messages (campaign_id, delivery_status);

UPDATE public.campaign_messages
   SET delivery_status = 'sent', last_event_at = COALESCE(last_event_at, sent_at)
 WHERE status = 'sent' AND delivery_status = 'queued';
UPDATE public.campaign_messages
   SET delivery_status = 'failed', failed_at = COALESCE(failed_at, updated_at)
 WHERE status = 'failed' AND delivery_status = 'queued';

ALTER TABLE public.campaign_messages REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.email_engagement_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.email_engagement_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

INSERT INTO public.platform_settings (key, value)
VALUES (
  'delivery_reconcile_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/reconcile-delivery',
    'token', encode(gen_random_bytes(32), 'hex')
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_delivery_reconcile_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'delivery_reconcile_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-munchreach-signature', token),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.run_delivery_reconcile_runner() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('munchreach-delivery-reconcile')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'munchreach-delivery-reconcile');

SELECT cron.schedule('munchreach-delivery-reconcile', '*/5 * * * *', $$SELECT public.run_delivery_reconcile_runner();$$);