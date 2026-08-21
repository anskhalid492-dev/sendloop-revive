INSERT INTO public.platform_settings (key, value)
VALUES (
  'transactional_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/run-transactional-email',
    'token', encode(gen_random_bytes(32), 'hex'),
    'limit', 25
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_transactional_email_runner()
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
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'transactional_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := jsonb_build_object('limit', coalesce((cfg ->> 'limit')::int, 25))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.run_transactional_email_runner() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('munchreach-transactional-email-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'munchreach-transactional-email-runner');

SELECT cron.schedule('munchreach-transactional-email-runner', '* * * * *', $$SELECT public.run_transactional_email_runner();$$);