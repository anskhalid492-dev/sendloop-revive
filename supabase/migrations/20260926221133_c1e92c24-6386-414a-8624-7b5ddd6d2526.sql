ALTER TYPE public.billing_provider ADD VALUE IF NOT EXISTS 'appsumo';

CREATE TABLE IF NOT EXISTS public.appsumo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','redeemed','revoked')),
  plan text NOT NULL DEFAULT 'lifetime',
  batch text NOT NULL DEFAULT 'production',
  redeemed_by uuid,
  redeemed_email text,
  redeemed_at timestamptz,
  redeemed_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS appsumo_codes_code_key ON public.appsumo_codes (code);
CREATE INDEX IF NOT EXISTS appsumo_codes_status_idx ON public.appsumo_codes (status);

CREATE TABLE IF NOT EXISTS public.appsumo_redemption_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid,
  code text,
  user_id uuid,
  email text,
  action text,
  success boolean,
  failure_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appsumo_logs_created_idx ON public.appsumo_redemption_logs (created_at DESC);

GRANT SELECT ON public.appsumo_codes TO authenticated;
GRANT ALL ON public.appsumo_codes TO service_role;
GRANT SELECT ON public.appsumo_redemption_logs TO authenticated;
GRANT ALL ON public.appsumo_redemption_logs TO service_role;

ALTER TABLE public.appsumo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appsumo_redemption_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read AppSumo codes" ON public.appsumo_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Platform admins can read AppSumo logs" ON public.appsumo_redemption_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Secure random code generator: MRAPP + 10 chars from a 32-symbol alphabet (50 bits).
CREATE OR REPLACE FUNCTION public.generate_appsumo_codes(_count integer, _batch text DEFAULT 'production')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _made integer := 0;
  _bytes bytea;
  _code text;
  _i integer;
  _n integer;
  _attempts integer := 0;
BEGIN
  IF _count IS NULL OR _count < 1 OR _count > 5000 THEN
    RAISE EXCEPTION 'count must be between 1 and 5000';
  END IF;
  WHILE _made < _count LOOP
    _attempts := _attempts + 1;
    IF _attempts > _count * 10 THEN RAISE EXCEPTION 'could not generate unique codes'; END IF;
    _bytes := extensions.gen_random_bytes(10);
    _code := 'MRAPP';
    FOR _i IN 0..9 LOOP
      _code := _code || substr(_alphabet, (get_byte(_bytes, _i) % 32) + 1, 1);
    END LOOP;
    INSERT INTO public.appsumo_codes (code, batch) VALUES (_code, coalesce(_batch, 'production'))
      ON CONFLICT (code) DO NOTHING;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _made := _made + _n;
  END LOOP;
  RETURN _made;
END; $$;

-- Atomic redemption. Row lock on the code guarantees exactly one winner.
CREATE OR REPLACE FUNCTION public.redeem_appsumo_code(
  _code text, _user_id uuid, _email text, _workspace_id uuid,
  _environment public.billing_environment, _ip text, _user_agent text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));
  _row public.appsumo_codes;
  _plan_id uuid;
  _sub_id uuid;
  _reason text;
BEGIN
  SELECT * INTO _row FROM public.appsumo_codes WHERE code = _norm FOR UPDATE;

  IF NOT FOUND THEN _reason := 'not_found';
  ELSIF _row.status = 'redeemed' THEN _reason := 'already_redeemed';
  ELSIF _row.status = 'revoked' THEN _reason := 'revoked';
  ELSIF _row.status <> 'available' THEN _reason := 'unavailable';
  END IF;

  IF _reason IS NULL THEN
    SELECT id INTO _plan_id FROM public.plans WHERE slug = 'lifetime' AND is_active LIMIT 1;
    IF _plan_id IS NULL THEN _reason := 'lifetime_plan_missing'; END IF;
  END IF;

  IF _reason IS NULL AND EXISTS (
    SELECT 1 FROM public.billing_subscriptions
    WHERE workspace_id = _workspace_id AND environment = _environment
      AND billing_interval = 'lifetime' AND status IN ('active','trialing')) THEN
    _reason := 'already_lifetime';
  END IF;

  IF _reason IS NULL AND EXISTS (
    SELECT 1 FROM public.billing_subscriptions
    WHERE workspace_id = _workspace_id AND environment = _environment
      AND provider = 'stripe' AND billing_interval <> 'lifetime'
      AND status IN ('active','trialing','past_due') AND amount_cents > 0
      AND NOT cancel_at_period_end) THEN
    _reason := 'active_recurring_subscription';
  END IF;

  IF _reason IS NOT NULL THEN
    INSERT INTO public.appsumo_redemption_logs (code_id, code, user_id, email, action, success, failure_reason, ip_address, user_agent)
    VALUES (_row.id, left(_norm, 64), _user_id, _email, 'redeem', false, _reason, _ip, left(_user_agent, 500));
    RETURN jsonb_build_object('ok', false, 'reason', _reason);
  END IF;

  INSERT INTO public.billing_subscriptions (
    workspace_id, plan_id, provider, environment, external_subscription_id,
    status, billing_interval, amount_cents, currency, current_period_start,
    current_period_end, last_event_at, manual_note)
  VALUES (
    _workspace_id, _plan_id, 'appsumo', _environment, 'appsumo_' || _row.id::text,
    'active', 'lifetime', 0, 'usd', now(), NULL, now(), 'AppSumo code redemption')
  RETURNING id INTO _sub_id;

  UPDATE public.appsumo_codes
    SET status = 'redeemed', redeemed_by = _user_id, redeemed_email = _email,
        redeemed_at = now(), redeemed_workspace_id = _workspace_id, subscription_id = _sub_id
  WHERE id = _row.id AND status = 'available';

  INSERT INTO public.appsumo_redemption_logs (code_id, code, user_id, email, action, success, ip_address, user_agent)
  VALUES (_row.id, _norm, _user_id, _email, 'redeem', true, _ip, left(_user_agent, 500));

  RETURN jsonb_build_object('ok', true, 'subscription_id', _sub_id);
END; $$;

-- Admin revoke: keeps history; ends the AppSumo Lifetime access if redeemed.
CREATE OR REPLACE FUNCTION public.revoke_appsumo_code(_code_id uuid, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.appsumo_codes;
BEGIN
  SELECT * INTO _row FROM public.appsumo_codes WHERE id = _code_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF _row.status = 'revoked' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  UPDATE public.appsumo_codes SET status = 'revoked', revoked_at = now(), revoked_by = _actor WHERE id = _row.id;
  IF _row.subscription_id IS NOT NULL THEN
    UPDATE public.billing_subscriptions
      SET status = 'cancelled', cancelled_at = now(), access_until = now(), updated_at = now()
    WHERE id = _row.subscription_id AND provider = 'appsumo';
  END IF;
  INSERT INTO public.appsumo_redemption_logs (code_id, code, user_id, action, success, failure_reason)
  VALUES (_row.id, _row.code, _actor, CASE WHEN _row.status = 'redeemed' THEN 'revoke_redeemed' ELSE 'revoke' END, true, NULL);
  RETURN jsonb_build_object('ok', true, 'was', _row.status);
END; $$;

REVOKE ALL ON FUNCTION public.generate_appsumo_codes(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_appsumo_code(text, uuid, text, uuid, public.billing_environment, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_appsumo_code(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_appsumo_codes(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_appsumo_code(text, uuid, text, uuid, public.billing_environment, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_appsumo_code(uuid, uuid) TO service_role;