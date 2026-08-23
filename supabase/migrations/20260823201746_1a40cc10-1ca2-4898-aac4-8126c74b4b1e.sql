ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS email_send_limit integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS emails_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limit_reached_at timestamptz;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_email_send_limit_positive;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_email_send_limit_positive CHECK (email_send_limit > 0 AND email_send_limit <= 1000000);

CREATE OR REPLACE FUNCTION public.reserve_campaign_send(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sent integer;
  _limit integer;
BEGIN
  UPDATE public.campaigns
     SET emails_sent_count = emails_sent_count + 1
   WHERE id = _campaign_id
     AND emails_sent_count < email_send_limit
  RETURNING emails_sent_count, email_send_limit INTO _sent, _limit;

  IF FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'sent', _sent, 'limit', _limit);
  END IF;

  SELECT emails_sent_count, email_send_limit INTO _sent, _limit
    FROM public.campaigns WHERE id = _campaign_id;

  IF _limit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'sent', 0, 'limit', 0);
  END IF;

  UPDATE public.campaigns
     SET limit_reached_at = COALESCE(limit_reached_at, now())
   WHERE id = _campaign_id;

  RETURN jsonb_build_object('allowed', false, 'sent', _sent, 'limit', _limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_campaign_send(_campaign_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.campaigns
     SET emails_sent_count = GREATEST(emails_sent_count - 1, 0)
   WHERE id = _campaign_id;
$$;

REVOKE ALL ON FUNCTION public.reserve_campaign_send(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_campaign_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_send(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_campaign_send(uuid) TO service_role;