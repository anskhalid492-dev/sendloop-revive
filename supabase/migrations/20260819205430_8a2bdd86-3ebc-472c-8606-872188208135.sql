CREATE TABLE IF NOT EXISTS public.referral_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  commission_type text NOT NULL DEFAULT 'percentage',
  commission_percent numeric(6,3) NOT NULL DEFAULT 0,
  commission_fixed_cents integer NOT NULL DEFAULT 0,
  recurring boolean NOT NULL DEFAULT false,
  commission_duration_months integer NOT NULL DEFAULT 12,
  minimum_payout_cents integer NOT NULL DEFAULT 5000,
  attribution_window_days integer NOT NULL DEFAULT 60,
  approval_mode text NOT NULL DEFAULT 'manual',
  approval_delay_days integer NOT NULL DEFAULT 30,
  refund_policy text NOT NULL DEFAULT 'reverse',
  payout_schedule text NOT NULL DEFAULT 'monthly',
  payout_methods text[] NOT NULL DEFAULT ARRAY['paypal','bank_transfer']::text[],
  payout_provider_configured boolean NOT NULL DEFAULT false,
  eligibility text NOT NULL DEFAULT 'Any Sendloop account in good standing can join the referral program.',
  terms text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_programs TO authenticated;
GRANT ALL ON public.referral_programs TO service_role;
ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read program settings" ON public.referral_programs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage program settings" ON public.referral_programs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.referral_programs (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  payout_method text,
  payout_destination_hint text,
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_profiles_code_idx ON public.referral_profiles (lower(code));

GRANT SELECT, UPDATE ON public.referral_profiles TO authenticated;
GRANT ALL ON public.referral_profiles TO service_role;
ALTER TABLE public.referral_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers read own profile" ON public.referral_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Referrers update own payout preference" ON public.referral_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage referral profiles" ON public.referral_profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_profile_id uuid REFERENCES public.referral_profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  ip_hash text,
  user_agent text,
  referer text,
  landing_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_clicks_profile_idx ON public.referral_clicks (referral_profile_id, created_at DESC);

GRANT SELECT ON public.referral_clicks TO authenticated;
GRANT ALL ON public.referral_clicks TO service_role;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers read own clicks" ON public.referral_clicks
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR referral_profile_id IN (SELECT id FROM public.referral_profiles WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_profile_id uuid NOT NULL REFERENCES public.referral_profiles(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  referred_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  program_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_attributions_profile_idx ON public.referral_attributions (referral_profile_id, created_at DESC);

GRANT SELECT ON public.referral_attributions TO authenticated;
GRANT ALL ON public.referral_attributions TO service_role;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers read own attributions" ON public.referral_attributions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR referrer_user_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_profile_id uuid NOT NULL REFERENCES public.referral_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'requested',
  method text,
  destination_hint text,
  reference text,
  admin_notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_payouts_profile_idx ON public.referral_payouts (referral_profile_id, created_at DESC);

GRANT SELECT ON public.referral_payouts TO authenticated;
GRANT ALL ON public.referral_payouts TO service_role;
ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers read own payouts" ON public.referral_payouts
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR user_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id uuid NOT NULL REFERENCES public.referral_attributions(id) ON DELETE CASCADE,
  referral_profile_id uuid NOT NULL REFERENCES public.referral_profiles(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  referred_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  subscription_id text,
  payment_id text,
  plan_name text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  commission_type text NOT NULL,
  commission_rate numeric(6,3) NOT NULL DEFAULT 0,
  commission_amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payout_id uuid REFERENCES public.referral_payouts(id) ON DELETE SET NULL,
  reversal_of uuid REFERENCES public.referral_commissions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_commissions_event_idx
  ON public.referral_commissions (provider, provider_event_id) WHERE reversal_of IS NULL;
CREATE INDEX IF NOT EXISTS referral_commissions_referrer_idx ON public.referral_commissions (referrer_user_id, status);

GRANT SELECT ON public.referral_commissions TO authenticated;
GRANT ALL ON public.referral_commissions TO service_role;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers read own commissions" ON public.referral_commissions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR referrer_user_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.referral_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text,
  error text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
GRANT SELECT ON public.referral_billing_events TO authenticated;
GRANT ALL ON public.referral_billing_events TO service_role;
ALTER TABLE public.referral_billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read billing events" ON public.referral_billing_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.referral_fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_profile_id uuid REFERENCES public.referral_profiles(id) ON DELETE CASCADE,
  attribution_id uuid REFERENCES public.referral_attributions(id) ON DELETE SET NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  status text NOT NULL DEFAULT 'open',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);
GRANT SELECT ON public.referral_fraud_flags TO authenticated;
GRANT ALL ON public.referral_fraud_flags TO service_role;
ALTER TABLE public.referral_fraud_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage fraud flags" ON public.referral_fraud_flags
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.referral_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  referral_profile_id uuid REFERENCES public.referral_profiles(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_audit_logs_created_idx ON public.referral_audit_logs (created_at DESC);

GRANT SELECT ON public.referral_audit_logs TO authenticated;
GRANT ALL ON public.referral_audit_logs TO service_role;
ALTER TABLE public.referral_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers read own audit trail" ON public.referral_audit_logs
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR referral_profile_id IN (SELECT id FROM public.referral_profiles WHERE user_id = auth.uid())
  );

CREATE TRIGGER referral_profiles_updated_at BEFORE UPDATE ON public.referral_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER referral_payouts_updated_at BEFORE UPDATE ON public.referral_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER referral_programs_updated_at BEFORE UPDATE ON public.referral_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.referral_program_public()
RETURNS TABLE(
  enabled boolean, commission_type text, commission_percent numeric,
  commission_fixed_cents integer, recurring boolean, commission_duration_months integer,
  minimum_payout_cents integer, attribution_window_days integer, approval_mode text,
  approval_delay_days integer, payout_schedule text, payout_methods text[],
  payout_provider_configured boolean, eligibility text, terms text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.enabled, p.commission_type, p.commission_percent, p.commission_fixed_cents,
         p.recurring, p.commission_duration_months, p.minimum_payout_cents,
         p.attribution_window_days, p.approval_mode, p.approval_delay_days,
         p.payout_schedule, p.payout_methods, p.payout_provider_configured,
         p.eligibility, p.terms
  FROM public.referral_programs p WHERE p.singleton LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.referral_program_public() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_referral_profile()
RETURNS public.referral_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  prof public.referral_profiles;
  new_code text;
  tries integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join the referral program'; END IF;

  SELECT * INTO prof FROM public.referral_profiles WHERE user_id = auth.uid();
  IF prof.id IS NOT NULL THEN RETURN prof; END IF;

  LOOP
    tries := tries + 1;
    new_code := upper(substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=OI01lL', 'abcdefghi'), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_profiles WHERE code = new_code);
    IF tries > 10 THEN RAISE EXCEPTION 'Could not generate a referral code, try again'; END IF;
  END LOOP;

  INSERT INTO public.referral_profiles (user_id, code)
  VALUES (auth.uid(), new_code)
  RETURNING * INTO prof;

  INSERT INTO public.referral_audit_logs (actor_id, actor_role, action, entity_type, entity_id, referral_profile_id, detail)
  VALUES (auth.uid(), 'customer', 'referral_profile_created', 'referral_profile', prof.id, prof.id, 'Referral profile created with code ' || prof.code);

  RETURN prof;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_referral_profile() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.referral_dashboard_stats()
RETURNS TABLE(
  clicks bigint, signups bigint, customers bigint, active_customers bigint,
  pending_cents bigint, approved_cents bigint, paid_cents bigint,
  reversed_cents bigint, requested_cents bigint, available_cents bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.referral_profiles WHERE user_id = auth.uid();
  IF pid IS NULL THEN
    RETURN QUERY SELECT 0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  WITH c AS (SELECT count(*) n FROM public.referral_clicks WHERE referral_profile_id = pid),
  a AS (
    SELECT count(*) signups,
           count(*) FILTER (WHERE status = 'converted') customers
    FROM public.referral_attributions WHERE referral_profile_id = pid
  ),
  ac AS (
    SELECT count(DISTINCT referred_user_id) n FROM public.referral_commissions
    WHERE referral_profile_id = pid AND status <> 'reversed'
      AND created_at > now() - interval '60 days'
  ),
  m AS (
    SELECT
      coalesce(sum(commission_amount_cents) FILTER (WHERE status = 'pending'), 0) pending,
      coalesce(sum(commission_amount_cents) FILTER (WHERE status = 'approved'), 0) approved,
      coalesce(sum(commission_amount_cents) FILTER (WHERE status = 'paid'), 0) paid,
      coalesce(sum(abs(commission_amount_cents)) FILTER (WHERE status = 'reversed'), 0) reversed
    FROM public.referral_commissions WHERE referral_profile_id = pid
  ),
  p AS (
    SELECT coalesce(sum(amount_cents) FILTER (WHERE status IN ('requested','under_review','approved','processing')), 0) requested
    FROM public.referral_payouts WHERE referral_profile_id = pid
  )
  SELECT c.n, a.signups, a.customers, ac.n, m.pending, m.approved, m.paid, m.reversed, p.requested,
         greatest(m.approved - p.requested, 0)
  FROM c, a, ac, m, p;
END; $$;
GRANT EXECUTE ON FUNCTION public.referral_dashboard_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_referral_payout(_amount_cents integer, _method text, _destination_hint text)
RETURNS public.referral_payouts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prof public.referral_profiles;
  prog public.referral_programs;
  available bigint;
  payout public.referral_payouts;
BEGIN
  SELECT * INTO prof FROM public.referral_profiles WHERE user_id = auth.uid();
  IF prof.id IS NULL THEN RAISE EXCEPTION 'Join the referral program first'; END IF;
  IF prof.status <> 'active' THEN RAISE EXCEPTION 'Your referral account is suspended'; END IF;

  SELECT * INTO prog FROM public.referral_programs WHERE singleton;
  IF NOT prog.enabled THEN RAISE EXCEPTION 'The referral program is currently disabled'; END IF;
  IF _method IS NULL OR NOT (_method = ANY (prog.payout_methods)) THEN
    RAISE EXCEPTION 'Choose one of the payout methods enabled by Sendloop';
  END IF;

  SELECT greatest(
    coalesce((SELECT sum(commission_amount_cents) FROM public.referral_commissions
              WHERE referral_profile_id = prof.id AND status = 'approved'), 0)
    - coalesce((SELECT sum(amount_cents) FROM public.referral_payouts
              WHERE referral_profile_id = prof.id AND status IN ('requested','under_review','approved','processing')), 0), 0)
  INTO available;

  IF _amount_cents <= 0 OR _amount_cents > available THEN
    RAISE EXCEPTION 'Requested amount exceeds your available balance';
  END IF;
  IF _amount_cents < prog.minimum_payout_cents THEN
    RAISE EXCEPTION 'Minimum payout is %', (prog.minimum_payout_cents / 100.0);
  END IF;

  INSERT INTO public.referral_payouts (referral_profile_id, user_id, amount_cents, method, destination_hint)
  VALUES (prof.id, auth.uid(), _amount_cents, _method, nullif(trim(coalesce(_destination_hint,'')), ''))
  RETURNING * INTO payout;

  UPDATE public.referral_profiles
  SET payout_method = _method, payout_destination_hint = payout.destination_hint
  WHERE id = prof.id;

  INSERT INTO public.referral_audit_logs (actor_id, actor_role, action, entity_type, entity_id, referral_profile_id, detail, metadata)
  VALUES (auth.uid(), 'customer', 'payout_requested', 'referral_payout', payout.id, prof.id,
          'Payout requested', jsonb_build_object('amount_cents', _amount_cents, 'method', _method));

  RETURN payout;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_referral_payout(integer, text, text) TO authenticated, service_role;