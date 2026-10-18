ALTER TABLE public.referral_programs ADD COLUMN IF NOT EXISTS monthly_commission_percent numeric NOT NULL DEFAULT 30, ADD COLUMN IF NOT EXISTS monthly_paid_periods integer NOT NULL DEFAULT 12, ADD COLUMN IF NOT EXISTS lifetime_commission_percent numeric NOT NULL DEFAULT 20, ADD COLUMN IF NOT EXISTS annual_commission_percent numeric NOT NULL DEFAULT 30, ADD COLUMN IF NOT EXISTS cookie_duration_days integer NOT NULL DEFAULT 60, ADD COLUMN IF NOT EXISTS affiliate_approval_required boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS operational_verified_at timestamptz;
ALTER TABLE public.referral_profiles ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS affiliate_payment_key text, ADD COLUMN IF NOT EXISTS reversed_cents integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS settled_cents integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS payable_at timestamptz;
CREATE TABLE public.affiliate_payments (payment_key text PRIMARY KEY, environment text NOT NULL, payment_id text NOT NULL, invoice_id text, customer_id text, attribution_id uuid REFERENCES public.referral_attributions(id), purchase_kind text, period_key text, paid_cents integer NOT NULL DEFAULT 0, eligible_cents integer NOT NULL DEFAULT 0, refunded_cents integer NOT NULL DEFAULT 0, disputed boolean NOT NULL DEFAULT false, currency text NOT NULL DEFAULT 'usd', commission_id uuid REFERENCES public.referral_commissions(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.affiliate_payments TO service_role;
ALTER TABLE public.affiliate_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read affiliate payments" ON public.affiliate_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.affiliate_payments TO authenticated;
CREATE TRIGGER affiliate_payments_updated_at BEFORE UPDATE ON public.affiliate_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.affiliate_adjustments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_key text NOT NULL REFERENCES public.affiliate_payments(payment_key), commission_id uuid NOT NULL REFERENCES public.referral_commissions(id), event_key text NOT NULL UNIQUE, delta_cents integer NOT NULL, reason text NOT NULL, actor_id uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.affiliate_adjustments TO service_role;
ALTER TABLE public.affiliate_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read affiliate adjustments" ON public.affiliate_adjustments FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.affiliate_adjustments TO authenticated;
CREATE TABLE public.affiliate_event_receipts (event_key text PRIMARY KEY, result text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.affiliate_event_receipts TO service_role;
ALTER TABLE public.affiliate_event_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read affiliate receipts" ON public.affiliate_event_receipts FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.affiliate_event_receipts TO authenticated;
CREATE TABLE public.affiliate_payout_allocations (payout_id uuid NOT NULL REFERENCES public.referral_payouts(id), commission_id uuid NOT NULL REFERENCES public.referral_commissions(id), amount_cents integer NOT NULL, PRIMARY KEY(payout_id,commission_id), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.affiliate_payout_allocations TO service_role;
ALTER TABLE public.affiliate_payout_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read payout allocations" ON public.affiliate_payout_allocations FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.affiliate_payout_allocations TO authenticated;
CREATE UNIQUE INDEX affiliate_commission_payment_idx ON public.referral_commissions(affiliate_payment_key) WHERE affiliate_payment_key IS NOT NULL;
CREATE INDEX affiliate_customer_period_idx ON public.affiliate_payments(attribution_id,purchase_kind,period_key);
REVOKE UPDATE ON public.referral_profiles FROM authenticated;
REVOKE SELECT ON public.referral_clicks,public.referral_attributions,public.referral_commissions,public.referral_payouts,public.referral_audit_logs FROM authenticated;
GRANT SELECT(id,status,signed_up_at,converted_at) ON public.referral_attributions TO authenticated;
GRANT SELECT(id,provider,plan_name,currency,commission_amount_cents,commission_rate,commission_type,status,created_at,approved_at,paid_at,reversed_at,reversed_cents,settled_cents,payable_at) ON public.referral_commissions TO authenticated;
GRANT SELECT(id,amount_cents,currency,status,method,destination_hint,reference,requested_at,paid_at,created_at) ON public.referral_payouts TO authenticated;
GRANT SELECT(id,action,detail,created_at) ON public.referral_audit_logs TO authenticated;
CREATE OR REPLACE FUNCTION public.affiliate_program_public() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('enabled',p.enabled AND p.operational_verified_at IS NOT NULL,'monthly_commission_percent',p.monthly_commission_percent,'monthly_paid_periods',p.monthly_paid_periods,'lifetime_commission_percent',p.lifetime_commission_percent,'annual_commission_percent',p.annual_commission_percent,'cookie_duration_days',p.cookie_duration_days,'affiliate_approval_required',p.affiliate_approval_required,'commission_type',p.commission_type,'commission_percent',p.monthly_commission_percent,'commission_fixed_cents',0,'recurring',true,'commission_duration_months',p.monthly_paid_periods,'minimum_payout_cents',p.minimum_payout_cents,'attribution_window_days',p.attribution_window_days,'approval_mode',p.approval_mode,'approval_delay_days',p.approval_delay_days,'payout_schedule',p.payout_schedule,'payout_methods',p.payout_methods,'payout_provider_configured',p.payout_provider_configured,'eligibility',replace(p.eligibility,'Sendloop','MunchReach'),'terms',replace(p.terms,'Sendloop','MunchReach')) FROM public.referral_programs p WHERE singleton LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.affiliate_program_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_program_public() TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.ensure_referral_profile() RETURNS public.referral_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE prof public.referral_profiles; needs_approval boolean; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to apply'; END IF; PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,19)); SELECT * INTO prof FROM public.referral_profiles WHERE user_id=auth.uid(); IF prof.id IS NOT NULL THEN RETURN prof; END IF; SELECT affiliate_approval_required INTO needs_approval FROM public.referral_programs WHERE singleton; INSERT INTO public.referral_profiles(user_id,code,status) VALUES(auth.uid(),upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),CASE WHEN needs_approval THEN 'pending' ELSE 'active' END) RETURNING * INTO prof; INSERT INTO public.referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail) VALUES(auth.uid(),'customer','affiliate_applied','referral_profile',prof.id,prof.id,'Affiliate application received'); RETURN prof; END $$;
REVOKE ALL ON FUNCTION public.ensure_referral_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_referral_profile() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.process_affiliate_payment(_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ek text:=_input->>'eventKey'; pk text:=_input->>'paymentKey'; p public.affiliate_payments; a public.referral_attributions; prog public.referral_programs; c public.referral_commissions; uid uuid; rate numeric; periods int; target int; delta int; result text:='ignored';
BEGIN
 IF ek IS NULL OR pk IS NULL OR _input->>'environment' NOT IN ('test','live') THEN RAISE EXCEPTION 'Invalid payment identity'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pk,31));
 IF EXISTS(SELECT 1 FROM public.affiliate_event_receipts WHERE event_key=ek) THEN RETURN jsonb_build_object('status','duplicate'); END IF;
 INSERT INTO public.affiliate_payments(payment_key,environment,payment_id) VALUES(pk,_input->>'environment',_input->>'paymentId') ON CONFLICT DO NOTHING;
 SELECT * INTO p FROM public.affiliate_payments WHERE payment_key=pk FOR UPDATE;
 IF _input->>'action'='adjust' THEN
   UPDATE public.affiliate_payments SET refunded_cents=greatest(refunded_cents,coalesce((_input->>'refundedCents')::int,0)),disputed=coalesce((_input->>'disputed')::boolean,disputed) WHERE payment_key=pk RETURNING * INTO p;
 ELSE
   SELECT * INTO prog FROM public.referral_programs WHERE singleton;
   IF NOT prog.enabled OR prog.operational_verified_at IS NULL OR p.commission_id IS NOT NULL THEN result:=CASE WHEN p.commission_id IS NOT NULL THEN 'duplicate_payment' ELSE 'inactive' END;
   ELSE
     SELECT owner_id INTO uid FROM public.workspaces WHERE id=(_input->>'workspaceId')::uuid;
     SELECT * INTO a FROM public.referral_attributions WHERE referred_user_id=uid FOR UPDATE;
     IF a.id IS NOT NULL THEN
       PERFORM 1 FROM public.referral_profiles WHERE id=a.referral_profile_id FOR UPDATE;
       IF a.referrer_user_id<>uid AND EXISTS(SELECT 1 FROM public.referral_profiles WHERE id=a.referral_profile_id AND status='active') AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=(_input->>'workspaceId')::uuid AND user_id=a.referrer_user_id) AND (a.converted_at IS NOT NULL OR a.expires_at>=to_timestamp((_input->>'paidAt')::bigint)) THEN
         SELECT count(DISTINCT period_key) INTO periods FROM public.affiliate_payments WHERE attribution_id=a.id AND purchase_kind='monthly' AND commission_id IS NOT NULL;
         rate:=CASE _input->>'kind' WHEN 'monthly' THEN coalesce((a.program_snapshot->>'monthly_commission_percent')::numeric,prog.monthly_commission_percent) WHEN 'annual' THEN coalesce((a.program_snapshot->>'annual_commission_percent')::numeric,prog.annual_commission_percent) WHEN 'lifetime' THEN coalesce((a.program_snapshot->>'lifetime_commission_percent')::numeric,prog.lifetime_commission_percent) ELSE 0 END;
         IF _input->>'currency'<>'usd' THEN rate:=0; END IF;
         IF _input->>'kind'='monthly' AND periods>=coalesce((a.program_snapshot->>'monthly_paid_periods')::int,prog.monthly_paid_periods) AND NOT EXISTS(SELECT 1 FROM public.affiliate_payments WHERE attribution_id=a.id AND purchase_kind='monthly' AND period_key=_input->>'periodKey' AND commission_id IS NOT NULL) THEN rate:=0; END IF;
         IF _input->>'kind' IN ('annual','lifetime') AND EXISTS(SELECT 1 FROM public.affiliate_payments WHERE attribution_id=a.id AND purchase_kind=_input->>'kind' AND commission_id IS NOT NULL) THEN rate:=0; END IF;
         IF rate>0 AND (_input->>'eligibleCents')::int>0 AND (_input->>'paidCents')::int>0 THEN
           UPDATE public.affiliate_payments SET attribution_id=a.id,invoice_id=_input->>'invoiceId',customer_id=_input->>'customerId',purchase_kind=_input->>'kind',period_key=_input->>'periodKey',paid_cents=(_input->>'paidCents')::int,eligible_cents=least((_input->>'eligibleCents')::int,(_input->>'paidCents')::int),currency='usd' WHERE payment_key=pk RETURNING * INTO p;
           target:=round(p.eligible_cents*rate/100.0);
           INSERT INTO public.referral_commissions(attribution_id,referral_profile_id,referrer_user_id,referred_user_id,referred_workspace_id,provider,provider_event_id,payment_id,subscription_id,plan_name,amount_cents,currency,commission_type,commission_rate,commission_amount_cents,status,approved_at,payable_at,affiliate_payment_key) VALUES(a.id,a.referral_profile_id,a.referrer_user_id,uid,(_input->>'workspaceId')::uuid,'stripe',ek,p.payment_id,_input->>'subscriptionId',_input->>'planName',p.eligible_cents,'usd','percentage',rate,target,CASE WHEN prog.approval_mode='auto' THEN 'approved' ELSE 'pending' END,CASE WHEN prog.approval_mode='auto' THEN now() ELSE NULL END,to_timestamp((_input->>'paidAt')::bigint)+make_interval(days=>prog.approval_delay_days),pk) RETURNING * INTO c;
           UPDATE public.affiliate_payments SET commission_id=c.id WHERE payment_key=pk RETURNING * INTO p;
           UPDATE public.referral_attributions SET status='converted',converted_at=coalesce(converted_at,to_timestamp((_input->>'paidAt')::bigint)),referred_workspace_id=coalesce(referred_workspace_id,(_input->>'workspaceId')::uuid) WHERE id=a.id;
           INSERT INTO public.referral_audit_logs(action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES('commission_created','referral_commission',c.id,a.referral_profile_id,'Commission from verified payment',jsonb_build_object('payment_key',pk,'rate',rate,'eligible_cents',p.eligible_cents));
           result:='commission_created';
         END IF;
       END IF;
     END IF;
   END IF;
 END IF;
 IF p.commission_id IS NOT NULL THEN
   SELECT * INTO c FROM public.referral_commissions WHERE id=p.commission_id FOR UPDATE;
   target:=CASE WHEN p.disputed THEN c.commission_amount_cents ELSE least(c.commission_amount_cents,round(c.commission_amount_cents*least(p.refunded_cents,p.paid_cents)::numeric/greatest(p.paid_cents,1))) END;
   delta:=target-c.reversed_cents;
   IF delta<>0 THEN
     INSERT INTO public.affiliate_adjustments(payment_key,commission_id,event_key,delta_cents,reason) VALUES(pk,c.id,ek,-delta,CASE WHEN p.disputed THEN 'chargeback' ELSE 'refund_or_dispute_resolution' END);
     UPDATE public.referral_commissions SET reversed_cents=target,reversed_at=CASE WHEN target>0 THEN now() ELSE NULL END WHERE id=c.id;
     INSERT INTO public.referral_audit_logs(action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES('commission_adjusted','referral_commission',c.id,c.referral_profile_id,'Payment refund or dispute adjustment',jsonb_build_object('delta_cents',-delta,'event_key',ek));
     result:='adjusted';
   END IF;
 END IF;
 INSERT INTO public.affiliate_event_receipts(event_key,result) VALUES(ek,result);
 RETURN jsonb_build_object('status',result);
END $$;
REVOKE ALL ON FUNCTION public.process_affiliate_payment(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_affiliate_payment(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.request_referral_payout(_amount_cents integer,_method text,_destination_hint text) RETURNS public.referral_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prof public.referral_profiles; prog public.referral_programs; available bigint; payout public.referral_payouts;
BEGIN
 SELECT * INTO prof FROM public.referral_profiles WHERE user_id=auth.uid() FOR UPDATE;
 IF prof.id IS NULL OR prof.status<>'active' THEN RAISE EXCEPTION 'Approved affiliate account required'; END IF;
 SELECT * INTO prog FROM public.referral_programs WHERE singleton;
 IF NOT prog.enabled OR prog.operational_verified_at IS NULL OR NOT prog.payout_provider_configured THEN RAISE EXCEPTION 'Payout processing is not active'; END IF;
 IF NOT(_method=ANY(prog.payout_methods)) OR length(trim(coalesce(_destination_hint,'')))<3 THEN RAISE EXCEPTION 'Valid payout method and details required'; END IF;
 SELECT coalesce(sum(commission_amount_cents-reversed_cents-settled_cents) FILTER(WHERE status IN('approved','paid') AND coalesce(payable_at,approved_at)<=now()),0)-coalesce(sum(greatest(settled_cents-(commission_amount_cents-reversed_cents),0)) FILTER(WHERE status NOT IN('approved','paid')),0) INTO available FROM public.referral_commissions WHERE referral_profile_id=prof.id AND currency='usd';
 available:=available-coalesce((SELECT sum(amount_cents) FROM public.referral_payouts WHERE referral_profile_id=prof.id AND currency='usd' AND status IN('requested','under_review','approved','processing')),0);
 IF _amount_cents<=0 OR _amount_cents>available OR _amount_cents<prog.minimum_payout_cents THEN RAISE EXCEPTION 'Amount must meet the minimum and available balance'; END IF;
 INSERT INTO public.referral_payouts(referral_profile_id,user_id,amount_cents,method,destination_hint) VALUES(prof.id,auth.uid(),_amount_cents,_method,trim(_destination_hint)) RETURNING * INTO payout;
 UPDATE public.referral_profiles SET payout_method=_method,payout_destination_hint=trim(_destination_hint) WHERE id=prof.id;
 INSERT INTO public.referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail) VALUES(auth.uid(),'customer','payout_requested','referral_payout',payout.id,prof.id,'Payout requested');
 RETURN payout;
END $$;
REVOKE ALL ON FUNCTION public.request_referral_payout(integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_referral_payout(integer,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.review_affiliate_payout(_id uuid,_status text,_reference text,_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.referral_payouts; c public.referral_commissions; remaining int; take int; available bigint;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO p FROM public.referral_payouts WHERE id=_id;
 PERFORM 1 FROM public.referral_profiles WHERE id=p.referral_profile_id FOR UPDATE;
 SELECT * INTO p FROM public.referral_payouts WHERE id=_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
 IF p.status=_status THEN RETURN; END IF;
 IF p.status IN('paid','rejected') OR _status NOT IN('under_review','approved','processing','paid','rejected') THEN RAISE EXCEPTION 'Invalid payout transition'; END IF;
 IF _status='paid' THEN
   IF length(trim(coalesce(_reference,'')))<3 THEN RAISE EXCEPTION 'Payment reference required'; END IF;
   SELECT coalesce(sum(commission_amount_cents-reversed_cents-settled_cents),0) INTO available FROM public.referral_commissions WHERE referral_profile_id=p.referral_profile_id AND currency=p.currency AND status IN('approved','paid') AND coalesce(payable_at,approved_at)<=now();
   IF available<p.amount_cents THEN RAISE EXCEPTION 'Balance changed; review refunds before payment'; END IF;
   remaining:=p.amount_cents;
   FOR c IN SELECT * FROM public.referral_commissions WHERE referral_profile_id=p.referral_profile_id AND currency=p.currency AND status IN('approved','paid') AND coalesce(payable_at,approved_at)<=now() AND commission_amount_cents-reversed_cents-settled_cents>0 ORDER BY created_at,id FOR UPDATE LOOP
     take:=least(remaining,c.commission_amount_cents-c.reversed_cents-c.settled_cents);
     INSERT INTO public.affiliate_payout_allocations(payout_id,commission_id,amount_cents) VALUES(p.id,c.id,take);
     UPDATE public.referral_commissions SET settled_cents=settled_cents+take,status=CASE WHEN settled_cents+take>=commission_amount_cents-reversed_cents THEN 'paid' ELSE status END,paid_at=now() WHERE id=c.id;
     remaining:=remaining-take; EXIT WHEN remaining=0;
   END LOOP;
 END IF;
 UPDATE public.referral_payouts SET status=_status,reference=nullif(trim(_reference),''),admin_notes=_notes,decided_at=now(),paid_at=CASE WHEN _status='paid' THEN now() ELSE paid_at END WHERE id=p.id;
 INSERT INTO public.referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'admin','payout_'||_status,'referral_payout',p.id,p.referral_profile_id,'Payout reviewed',jsonb_build_object('reference',_reference,'notes',_notes,'amount_cents',p.amount_cents));
END $$;
REVOKE ALL ON FUNCTION public.review_affiliate_payout(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_affiliate_payout(uuid,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.review_affiliate_commission(_id uuid,_action text,_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.referral_commissions;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO c FROM public.referral_commissions WHERE id=_id;
 PERFORM 1 FROM public.referral_profiles WHERE id=c.referral_profile_id FOR UPDATE;
 SELECT * INTO c FROM public.referral_commissions WHERE id=_id FOR UPDATE;
 IF c.id IS NULL OR length(trim(coalesce(_notes,'')))<3 THEN RAISE EXCEPTION 'Commission and review reason required'; END IF;
 IF _action='approve' AND c.status='pending' THEN UPDATE public.referral_commissions SET status='approved',approved_at=now() WHERE id=_id;
 ELSIF _action='reject' AND c.status='pending' THEN UPDATE public.referral_commissions SET status='rejected',rejected_at=now() WHERE id=_id;
 ELSIF _action='reverse' AND c.status IN('pending','approved','paid') AND c.affiliate_payment_key IS NOT NULL THEN
 INSERT INTO public.affiliate_adjustments(payment_key,commission_id,event_key,delta_cents,reason,actor_id) VALUES(c.affiliate_payment_key,c.id,'admin:'||gen_random_uuid()::text,-(c.commission_amount_cents-c.reversed_cents),_notes,auth.uid());
 UPDATE public.referral_commissions SET reversed_cents=commission_amount_cents,status='reversed',reversed_at=now() WHERE id=_id;
 ELSE RAISE EXCEPTION 'Invalid commission transition'; END IF;
 INSERT INTO public.referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'admin','commission_'||_action,'referral_commission',c.id,c.referral_profile_id,'Commission reviewed',jsonb_build_object('reason',_notes));
END $$;
REVOKE ALL ON FUNCTION public.review_affiliate_commission(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_affiliate_commission(uuid,text,text) TO authenticated;
ALTER TABLE public.referral_programs ALTER COLUMN commission_percent SET DEFAULT 30, ALTER COLUMN recurring SET DEFAULT true, ALTER COLUMN eligibility SET DEFAULT 'Agencies, consultants and creators with a MunchReach account may apply. Approval is required where configured. Only genuinely new customers qualify; self-referrals and fraudulent activity are prohibited.';