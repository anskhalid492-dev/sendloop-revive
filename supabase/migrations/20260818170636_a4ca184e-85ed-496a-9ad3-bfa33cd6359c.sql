INSERT INTO public.platform_settings (key, value)
VALUES
  ('campaign_runner', jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/run-campaigns',
    'token', encode(gen_random_bytes(32), 'hex')
  )),
  ('inbound_retry_runner', jsonb_build_object(
    'url', 'https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app/api/public/cron/retry-inbound',
    'token', encode(gen_random_bytes(32), 'hex')
  ))
ON CONFLICT (key) DO NOTHING;