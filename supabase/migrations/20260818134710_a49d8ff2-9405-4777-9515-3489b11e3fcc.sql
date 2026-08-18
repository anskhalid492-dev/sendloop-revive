CREATE OR REPLACE FUNCTION public.run_inbound_retry()
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
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'inbound_retry_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := '{}'::jsonb
  );
END; $function$;

SELECT cron.unschedule('sendloop-inbound-retry') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sendloop-inbound-retry');

SELECT cron.schedule('sendloop-inbound-retry', '*/10 * * * *', $$SELECT public.run_inbound_retry();$$);