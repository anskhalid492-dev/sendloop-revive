INSERT INTO public.platform_settings (key, value)
VALUES (
  'domain_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/recheck-domains',
    'token', encode(gen_random_bytes(32), 'hex')
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_domain_recheck_runner()
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
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'domain_runner';
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

REVOKE ALL ON FUNCTION public.run_domain_recheck_runner() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('munchreach-domain-recheck-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'munchreach-domain-recheck-runner');

SELECT cron.schedule('munchreach-domain-recheck-runner', '*/5 * * * *', $$SELECT public.run_domain_recheck_runner();$$);