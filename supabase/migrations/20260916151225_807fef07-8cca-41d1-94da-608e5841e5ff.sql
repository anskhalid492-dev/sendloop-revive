-- lovable-cron-fallback-reviewed: 360 runs/day; IMAP has no push/webhook for third-party mailboxes, so new prospect replies can only be discovered by polling each mailbox; 4 minutes is the agreed freshness window.
INSERT INTO public.platform_settings (key, value)
VALUES (
  'mailbox_poll_runner',
  jsonb_build_object(
    'url', 'https://munchreach.com/api/public/cron/poll-mailboxes',
    'token', encode(gen_random_bytes(32), 'hex')
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_mailbox_poll()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'mailbox_poll_runner';
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
$$;

REVOKE EXECUTE ON FUNCTION public.run_mailbox_poll() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('munchreach-mailbox-poll', '*/4 * * * *', $$SELECT public.run_mailbox_poll();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'munchreach-mailbox-poll');