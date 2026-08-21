INSERT INTO public.platform_settings (key, value)
VALUES (
  'provider_health_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/provider-health',
    'token', encode(gen_random_bytes(32), 'hex')
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_provider_health_runner()
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
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'provider_health_runner';
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

GRANT EXECUTE ON FUNCTION public.run_provider_health_runner() TO postgres, service_role;

SELECT cron.unschedule('munchreach-provider-health-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'munchreach-provider-health-runner');

SELECT cron.schedule('munchreach-provider-health-runner', '*/10 * * * *', $$SELECT public.run_provider_health_runner();$$);