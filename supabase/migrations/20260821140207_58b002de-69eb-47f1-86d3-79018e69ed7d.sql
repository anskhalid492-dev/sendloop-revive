INSERT INTO public.platform_settings (key, value)
VALUES (
  'ai_personalization_runner',
  jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/run-ai-personalization',
    'token', encode(gen_random_bytes(32), 'hex')
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_ai_personalization_runner()
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
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'ai_personalization_runner';
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

REVOKE ALL ON FUNCTION public.run_ai_personalization_runner() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('munchreach-ai-personalization-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'munchreach-ai-personalization-runner');

SELECT cron.schedule('munchreach-ai-personalization-runner', '* * * * *', $$SELECT public.run_ai_personalization_runner();$$);
