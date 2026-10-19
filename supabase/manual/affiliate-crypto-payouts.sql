-- Owner-applied additive migration AFTER all nine 20261018 affiliate migrations.
-- Not executed by Lovable. No historical rows, commission rates or program activation are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS public.affiliate_wallets (
 user_id uuid PRIMARY KEY, network text NOT NULL, address text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_wallets TO authenticated;
GRANT ALL ON public.affiliate_wallets TO service_role;
ALTER TABLE public.affiliate_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wallet owner or admin reads" ON public.affiliate_wallets FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TABLE IF NOT EXISTS public.affiliate_balance_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referral_profile_id uuid NOT NULL REFERENCES public.referral_profiles(id),
 environment text NOT NULL, delta_cents bigint NOT NULL, before_cents bigint NOT NULL, after_cents bigint NOT NULL,
 reason text NOT NULL, actor_id uuid NOT NULL, request_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_balance_adjustments TO authenticated;
GRANT ALL ON public.affiliate_balance_adjustments TO service_role;
ALTER TABLE public.affiliate_balance_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Adjustment owner or admin reads" ON public.affiliate_balance_adjustments FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') OR referral_profile_id IN(SELECT id FROM public.referral_profiles WHERE user_id=auth.uid()));
CREATE TABLE IF NOT EXISTS public.affiliate_payout_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payout_id uuid NOT NULL REFERENCES public.referral_payouts(id),
 object_key text NOT NULL UNIQUE, file_name text NOT NULL, mime_type text NOT NULL, size bigint NOT NULL,
 uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_payout_proofs TO authenticated;
GRANT ALL ON public.affiliate_payout_proofs TO service_role;
ALTER TABLE public.affiliate_payout_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Proof payout owner or admin reads" ON public.affiliate_payout_proofs FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') OR payout_id IN(SELECT id FROM public.referral_payouts WHERE user_id=auth.uid()));
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS crypto_network text;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS wallet_address text;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS actual_paid_cents integer;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS adjustment_allocated_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS payout_environment text;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS request_key uuid;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS processing_due_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_payout_request_key_idx ON public.referral_payouts(request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_crypto_transaction_idx ON public.referral_payouts(crypto_network,lower(regexp_replace(reference,'^(0x|0X)',''))) WHERE status='paid' AND crypto_network IS NOT NULL AND reference IS NOT NULL;
GRANT SELECT(user_id,crypto_network,wallet_address,actual_paid_cents,payout_environment,processing_due_at) ON public.referral_payouts TO authenticated;

-- One shared calculation for dashboard, reservation, settlement and adjustments.
-- NULL environment is legacy live. Historical paid records/allocations remain untouched.
CREATE OR REPLACE FUNCTION public.affiliate_spendable(_profile uuid,_environment text) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT coalesce(sum(commission_amount_cents-reversed_cents-settled_cents) FILTER(WHERE (status='approved' OR (status='paid' AND (settled_cents>0 OR affiliate_payment_key IS NOT NULL))) AND coalesce(payable_at,approved_at)<=now()),0) - coalesce(sum(greatest(settled_cents-(commission_amount_cents-reversed_cents),0)) FILTER(WHERE status NOT IN('approved','paid')),0) FROM referral_commissions WHERE referral_profile_id=_profile AND currency='usd' AND coalesce(affiliate_environment,'live')=_environment),0)
 +coalesce((SELECT sum(delta_cents) FROM affiliate_balance_adjustments WHERE referral_profile_id=_profile AND environment=_environment),0)
 -coalesce((SELECT sum(adjustment_allocated_cents) FROM referral_payouts WHERE referral_profile_id=_profile AND status='paid' AND coalesce(payout_environment,'live')=_environment),0)
$$;
REVOKE ALL ON FUNCTION public.affiliate_spendable(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_spendable(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.affiliate_reserved(_profile uuid,_environment text) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(sum(amount_cents),0) FROM referral_payouts WHERE referral_profile_id=_profile AND currency='usd' AND coalesce(payout_environment,'live')=_environment AND status IN('requested','under_review','approved','processing')
$$;
REVOKE ALL ON FUNCTION public.affiliate_reserved(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_reserved(uuid,text) TO service_role;

-- Service-only: the authenticated server verifies network checksum before this write.
CREATE OR REPLACE FUNCTION public.save_affiliate_crypto_wallet(_user uuid,_network text,_address text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; BEGIN
 SELECT id INTO pid FROM referral_profiles WHERE user_id=_user FOR UPDATE;
 IF pid IS NULL THEN RAISE EXCEPTION 'Affiliate account required'; END IF;
 IF (_network='usdc_ethereum' AND _address ~ '^0x[0-9A-Fa-f]{40}$' AND _address !~ '^0x0{40}$') OR (_network='usdt_tron' AND _address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$') THEN
 INSERT INTO affiliate_wallets(user_id,network,address) VALUES(_user,_network,_address) ON CONFLICT(user_id) DO UPDATE SET network=excluded.network,address=excluded.address,updated_at=now();
 INSERT INTO referral_audit_logs(actor_id,actor_role,action,entity_type,referral_profile_id,detail) VALUES(_user,'customer','crypto_wallet_updated','affiliate_wallet',pid,'Wallet updated; existing payout destinations unchanged');
 ELSE RAISE EXCEPTION 'Invalid crypto wallet'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_affiliate_crypto_wallet(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_affiliate_crypto_wallet(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.request_affiliate_crypto_payout(_amount integer,_request_key uuid) RETURNS public.referral_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prof referral_profiles; prog referral_programs; wallet affiliate_wallets; p referral_payouts; available bigint;
BEGIN
 IF auth.uid() IS NULL OR _request_key IS NULL THEN RAISE EXCEPTION 'Authentication and request key required'; END IF;
 SELECT * INTO prof FROM referral_profiles WHERE user_id=auth.uid() FOR UPDATE;
 IF prof.id IS NULL OR prof.status<>'active' THEN RAISE EXCEPTION 'Approved affiliate account required'; END IF;
 SELECT * INTO p FROM referral_payouts WHERE request_key=_request_key;
 IF p.id IS NOT NULL THEN IF p.user_id<>auth.uid() OR p.amount_cents<>_amount THEN RAISE EXCEPTION 'Request key conflict'; END IF; RETURN p; END IF;
 SELECT * INTO prog FROM referral_programs WHERE singleton;
 IF NOT prog.enabled OR prog.operational_verified_at IS NULL OR NOT prog.payout_provider_configured THEN RAISE EXCEPTION 'Payout processing is not active'; END IF;
 SELECT * INTO wallet FROM affiliate_wallets WHERE user_id=auth.uid();
 IF wallet.user_id IS NULL OR wallet.network NOT IN('usdc_ethereum','usdt_tron') THEN RAISE EXCEPTION 'Save a valid crypto wallet first'; END IF;
 -- Only one unfinished request per affiliate; legacy reservations also block a new request.
 IF affiliate_reserved(prof.id,'live')>0 THEN RAISE EXCEPTION 'A payout request is already pending'; END IF;
 available:=affiliate_spendable(prof.id,'live');
 IF _amount IS NULL OR _amount<10000 OR _amount>available THEN RAISE EXCEPTION 'Minimum payout is $100 and amount cannot exceed available balance'; END IF;
 INSERT INTO referral_payouts(referral_profile_id,user_id,amount_cents,currency,method,destination_hint,crypto_network,wallet_address,payout_environment,request_key,processing_due_at)
 VALUES(prof.id,auth.uid(),_amount,'usd','crypto',wallet.address,wallet.network,wallet.address,'live',_request_key,now()+interval '60 days') RETURNING * INTO p;
 INSERT INTO referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'customer','payout_requested','referral_payout',p.id,prof.id,'Crypto payout requested',jsonb_build_object('amount_cents',_amount,'network',wallet.network,'processing_due_at',p.processing_due_at));
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.request_affiliate_crypto_payout(integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_affiliate_crypto_payout(integer,uuid) TO authenticated;
-- Retire old request method without removing its signature or old payout records.
CREATE OR REPLACE FUNCTION public.request_referral_payout(_amount_cents integer,_method text,_destination_hint text) RETURNS public.referral_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Use the crypto wallet payout request'; END $$;
CREATE OR REPLACE FUNCTION public.affiliate_private_preferences(_user_id uuid,_method text,_details text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Use the crypto wallet settings'; END $$;

CREATE OR REPLACE FUNCTION public.adjust_affiliate_balance(_profile uuid,_delta bigint,_reason text,_request_key uuid,_environment text DEFAULT 'live') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_balance bigint; after_balance bigint; existing affiliate_balance_adjustments; adjustment_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _environment NOT IN('live','test') OR _delta IS NULL OR _delta=0 OR abs(_delta)>100000000 OR length(trim(coalesce(_reason,'')))<3 OR _request_key IS NULL THEN RAISE EXCEPTION 'Valid amount, environment, reason and request key required'; END IF;
 PERFORM 1 FROM referral_profiles WHERE id=_profile FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found'; END IF;
 SELECT * INTO existing FROM affiliate_balance_adjustments WHERE request_key=_request_key;
 IF existing.id IS NOT NULL THEN IF existing.referral_profile_id<>_profile OR existing.delta_cents<>_delta OR existing.environment<>_environment OR existing.reason<>trim(_reason) THEN RAISE EXCEPTION 'Adjustment key conflict'; END IF; RETURN existing.id; END IF;
 before_balance:=affiliate_spendable(_profile,_environment)-affiliate_reserved(_profile,_environment);
 after_balance:=before_balance+_delta;
 IF after_balance<0 THEN RAISE EXCEPTION 'Adjustment cannot spend reserved funds or make available balance negative'; END IF;
 INSERT INTO affiliate_balance_adjustments(referral_profile_id,environment,delta_cents,before_cents,after_cents,reason,actor_id,request_key) VALUES(_profile,_environment,_delta,before_balance,after_balance,trim(_reason),auth.uid(),_request_key) RETURNING id INTO adjustment_id;
 INSERT INTO referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'admin','balance_adjusted','affiliate_balance_adjustment',adjustment_id,_profile,trim(_reason),jsonb_build_object('before_cents',before_balance,'after_cents',after_balance,'delta_cents',_delta,'environment',_environment));
 RETURN adjustment_id;
END $$;
REVOKE ALL ON FUNCTION public.adjust_affiliate_balance(uuid,bigint,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_affiliate_balance(uuid,bigint,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_affiliate_crypto_payout(_id uuid,_status text,_actual integer,_reference text,_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p referral_payouts; c referral_commissions; remaining bigint; take integer; credit bigint; env text; outstanding bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO p FROM referral_payouts WHERE id=_id;
 PERFORM 1 FROM referral_profiles WHERE id=p.referral_profile_id FOR UPDATE;
 SELECT * INTO p FROM referral_payouts WHERE id=_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
 IF p.currency<>'usd' THEN RAISE EXCEPTION 'Only USD balances can be settled; retain other currency history for reconciliation'; END IF;
 IF p.status='paid' AND _status='paid' THEN
 IF coalesce(p.actual_paid_cents,p.amount_cents)<>_actual OR coalesce(p.reference,'')<>trim(coalesce(_reference,'')) THEN RAISE EXCEPTION 'Paid payout is immutable'; END IF; RETURN;
 END IF;
 IF p.status='rejected' AND _status='rejected' THEN RETURN; END IF;
 IF p.status IN('paid','rejected') OR _status NOT IN('approved','processing','paid','rejected','under_review') THEN RAISE EXCEPTION 'Invalid payout transition'; END IF;
 IF _status='processing' AND p.status NOT IN('approved','processing') THEN RAISE EXCEPTION 'Approve the payout first'; END IF;
 IF _status='approved' AND p.status='processing' THEN RAISE EXCEPTION 'Cannot move processing payout backwards'; END IF;
 IF _status='under_review' AND p.status IN('approved','processing') THEN RAISE EXCEPTION 'Cannot move approved payout backwards'; END IF;
 IF _status='rejected' AND length(trim(coalesce(_notes,'')))<3 THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
 env:=coalesce(p.payout_environment,'live');
 IF _status='paid' THEN
 IF p.crypto_network IS NULL OR p.method<>'crypto' THEN RAISE EXCEPTION 'Historical requests retain their original records; reject and request again using a saved crypto wallet'; END IF;
 IF p.status NOT IN('approved','processing') THEN RAISE EXCEPTION 'Approve the payout before marking paid'; END IF;
 IF _actual IS NULL OR _actual<=0 OR _actual>p.amount_cents OR length(trim(coalesce(_reference,'')))<3 THEN RAISE EXCEPTION 'Valid actual paid amount and transaction ID required'; END IF;
 IF p.crypto_network IS NOT NULL AND trim(_reference) !~ '^(0x)?[0-9a-fA-F]{64}$' THEN RAISE EXCEPTION 'Enter the blockchain transaction hash'; END IF;
 IF _actual<>p.amount_cents AND length(trim(coalesce(_notes,'')))<3 THEN RAISE EXCEPTION 'Partial payment reason required'; END IF;
 outstanding:=affiliate_reserved(p.referral_profile_id,env)-p.amount_cents;
 IF affiliate_spendable(p.referral_profile_id,env)-outstanding<_actual THEN RAISE EXCEPTION 'Balance changed; review refunds before payment'; END IF;
 remaining:=_actual;
 FOR c IN SELECT * FROM referral_commissions WHERE referral_profile_id=p.referral_profile_id AND currency='usd' AND coalesce(affiliate_environment,'live')=env AND (status='approved' OR (status='paid' AND (settled_cents>0 OR affiliate_payment_key IS NOT NULL))) AND coalesce(payable_at,approved_at)<=now() AND commission_amount_cents-reversed_cents-settled_cents>0 ORDER BY created_at,id FOR UPDATE LOOP
 take:=least(remaining,c.commission_amount_cents-c.reversed_cents-c.settled_cents);
 INSERT INTO affiliate_payout_allocations(payout_id,commission_id,amount_cents) VALUES(p.id,c.id,take);
 UPDATE referral_commissions SET settled_cents=settled_cents+take,status=CASE WHEN settled_cents+take>=commission_amount_cents-reversed_cents THEN 'paid' ELSE status END,paid_at=now() WHERE id=c.id;
 remaining:=remaining-take; EXIT WHEN remaining=0;
 END LOOP;
 credit:=coalesce((SELECT sum(delta_cents) FROM affiliate_balance_adjustments WHERE referral_profile_id=p.referral_profile_id AND environment=env),0)-coalesce((SELECT sum(adjustment_allocated_cents) FROM referral_payouts WHERE referral_profile_id=p.referral_profile_id AND status='paid' AND coalesce(payout_environment,'live')=env),0);
 IF remaining>greatest(credit,0) THEN RAISE EXCEPTION 'Incomplete payout allocation'; END IF;
 UPDATE referral_payouts SET adjustment_allocated_cents=remaining,actual_paid_cents=_actual WHERE id=p.id;
 END IF;
 UPDATE referral_payouts SET status=_status,reference=CASE WHEN _status='paid' THEN trim(_reference) ELSE reference END,admin_notes=_notes,decided_at=now(),paid_at=CASE WHEN _status='paid' THEN now() ELSE paid_at END WHERE id=p.id;
 INSERT INTO referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'admin','payout_'||_status,'referral_payout',p.id,p.referral_profile_id,coalesce(_notes,'Payout reviewed'),jsonb_build_object('before_status',p.status,'after_status',_status,'requested_cents',p.amount_cents,'actual_paid_cents',_actual,'reference',_reference,'environment',env));
END $$;
REVOKE ALL ON FUNCTION public.review_affiliate_crypto_payout(uuid,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_affiliate_crypto_payout(uuid,text,integer,text,text) TO authenticated;
-- Existing RPC now shares the same locked settlement path (historical methods remain visible).
CREATE OR REPLACE FUNCTION public.review_affiliate_payout(_id uuid,_status text,_reference text,_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE amount integer; BEGIN SELECT amount_cents INTO amount FROM referral_payouts WHERE id=_id; PERFORM review_affiliate_crypto_payout(_id,_status,amount,_reference,_notes); END $$;

CREATE OR REPLACE FUNCTION public.affiliate_dashboard_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; result jsonb; BEGIN SELECT id INTO pid FROM referral_profiles WHERE user_id=auth.uid(); IF pid IS NULL THEN RETURN '{}'::jsonb; END IF;
 SELECT jsonb_build_object('clicks',(SELECT count(*) FROM referral_clicks WHERE referral_profile_id=pid),'signups',(SELECT count(*) FROM referral_attributions WHERE referral_profile_id=pid),'customers',(SELECT count(*) FROM referral_attributions WHERE referral_profile_id=pid AND converted_at IS NOT NULL),'active_customers',0,
 'pending_cents',coalesce(sum(greatest(commission_amount_cents-reversed_cents,0)) FILTER(WHERE status='pending'),0),
 'approved_cents',coalesce(sum(greatest(commission_amount_cents-reversed_cents-settled_cents,0)) FILTER(WHERE status='approved'),0),
 'paid_cents',coalesce(sum(CASE WHEN status='paid' AND settled_cents=0 AND affiliate_payment_key IS NULL THEN greatest(commission_amount_cents-reversed_cents,0) ELSE settled_cents END),0), 'reversed_cents',coalesce(sum(reversed_cents),0),
 'requested_cents',affiliate_reserved(pid,'live'),'available_cents',greatest(affiliate_spendable(pid,'live')-affiliate_reserved(pid,'live'),0),
 'total_payout_paid_cents',(SELECT coalesce(sum(coalesce(actual_paid_cents,amount_cents)),0) FROM referral_payouts WHERE referral_profile_id=pid AND status='paid' AND currency='usd' AND coalesce(payout_environment,'live')='live')) INTO result
 FROM referral_commissions WHERE referral_profile_id=pid AND currency='usd' AND coalesce(affiliate_environment,'live')='live'; RETURN result; END $$;
-- Preserve the existing service-only summary access, now using shared balance math.
REVOKE ALL ON FUNCTION public.affiliate_dashboard_stats() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_dashboard_stats() TO service_role;
CREATE OR REPLACE FUNCTION public.affiliate_admin_earnings(_environment text DEFAULT 'live') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _environment NOT IN('test','live') THEN RAISE EXCEPTION 'Invalid environment'; END IF;
 RETURN (SELECT jsonb_build_object('commission_count',count(*),'commission_cents',coalesce(sum(commission_amount_cents),0),'pending_cents',coalesce(sum(greatest(commission_amount_cents-reversed_cents,0)) FILTER(WHERE status='pending'),0),'approved_cents',coalesce(sum(greatest(commission_amount_cents-reversed_cents-settled_cents,0)) FILTER(WHERE status='approved'),0),'paid_commission_cents',coalesce(sum(CASE WHEN status='paid' AND settled_cents=0 AND affiliate_payment_key IS NULL THEN greatest(commission_amount_cents-reversed_cents,0) ELSE settled_cents END),0),
 'pending_payout_count',(SELECT count(*) FROM referral_payouts WHERE status IN('requested','under_review','approved','processing') AND coalesce(payout_environment,'live')=_environment),
 'completed_payout_count',(SELECT count(*) FROM referral_payouts WHERE status='paid' AND coalesce(payout_environment,'live')=_environment),
 'liability_cents',(SELECT coalesce(sum(greatest(affiliate_spendable(id,_environment),0)),0) FROM referral_profiles)) FROM referral_commissions WHERE currency='usd' AND coalesce(affiliate_environment,'live')=_environment);
END $$;
REVOKE ALL ON FUNCTION public.affiliate_admin_earnings(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.affiliate_admin_earnings(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_affiliate_payout_proof(_id uuid,_payout uuid,_key text,_name text,_mime text,_size bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; BEGIN
 IF auth.uid() IS NULL OR NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT referral_profile_id INTO pid FROM referral_payouts WHERE id=_payout FOR UPDATE;
 IF pid IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
 IF _size IS NULL OR _size<=0 OR _size>5242880 OR _mime NOT IN('image/png','image/jpeg','image/webp','application/pdf') OR _key<>'affiliate-proofs/'||_payout::text||'/'||_id::text OR length(coalesce(_name,'')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid payment proof'; END IF;
 INSERT INTO affiliate_payout_proofs(id,payout_id,object_key,file_name,mime_type,size,uploaded_by) VALUES(_id,_payout,_key,_name,_mime,_size,auth.uid());
 INSERT INTO referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'admin','payout_proof_attached','referral_payout',_payout,pid,'Private payment proof attached',jsonb_build_object('proof_id',_id,'file_name',_name,'size',_size));
END $$;
REVOKE ALL ON FUNCTION public.record_affiliate_payout_proof(uuid,uuid,text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_affiliate_payout_proof(uuid,uuid,text,text,text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
