CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

INSERT INTO public.platform_settings (key, value)
VALUES (
  'warmup_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/run-warmup',
    'token', encode(gen_random_bytes(32), 'hex'),
    'limit', 25
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_warmup_runner()
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
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'warmup_runner';
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

SELECT cron.unschedule('sendloop-warmup-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sendloop-warmup-runner');

SELECT cron.schedule('sendloop-warmup-runner', '*/5 * * * *', $$SELECT public.run_warmup_runner();$$);