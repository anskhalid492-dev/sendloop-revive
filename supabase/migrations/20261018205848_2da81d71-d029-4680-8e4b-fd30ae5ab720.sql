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
   SELECT coalesce(sum(commission_amount_cents-reversed_cents-settled_cents),0) INTO available FROM public.referral_commissions WHERE referral_profile_id=p.referral_profile_id AND currency=p.currency AND coalesce(affiliate_environment,'live')='live' AND status IN('approved','paid') AND coalesce(payable_at,approved_at)<=now();
   available:=available-coalesce((SELECT sum(greatest(settled_cents-(commission_amount_cents-reversed_cents),0)) FROM public.referral_commissions WHERE referral_profile_id=p.referral_profile_id AND coalesce(affiliate_environment,'live')='live' AND currency=p.currency AND status NOT IN('approved','paid')),0);
   IF available<p.amount_cents THEN RAISE EXCEPTION 'Balance changed; review refunds before payment'; END IF;
   remaining:=p.amount_cents;
   FOR c IN SELECT * FROM public.referral_commissions WHERE referral_profile_id=p.referral_profile_id AND currency=p.currency AND coalesce(affiliate_environment,'live')='live' AND status IN('approved','paid') AND coalesce(payable_at,approved_at)<=now() AND commission_amount_cents-reversed_cents-settled_cents>0 ORDER BY created_at,id FOR UPDATE LOOP
     take:=least(remaining,c.commission_amount_cents-c.reversed_cents-c.settled_cents);
     INSERT INTO public.affiliate_payout_allocations(payout_id,commission_id,amount_cents) VALUES(p.id,c.id,take);
     UPDATE public.referral_commissions SET settled_cents=settled_cents+take,status=CASE WHEN settled_cents+take>=commission_amount_cents-reversed_cents THEN 'paid' ELSE status END,paid_at=now() WHERE id=c.id;
     remaining:=remaining-take; EXIT WHEN remaining=0;
   END LOOP;
   IF remaining<>0 THEN RAISE EXCEPTION 'Incomplete payout allocation; retry review'; END IF;
 END IF;
 UPDATE public.referral_payouts SET status=_status,reference=nullif(trim(_reference),''),admin_notes=_notes,decided_at=now(),paid_at=CASE WHEN _status='paid' THEN now() ELSE paid_at END WHERE id=p.id;
 INSERT INTO public.referral_audit_logs(actor_id,actor_role,action,entity_type,entity_id,referral_profile_id,detail,metadata) VALUES(auth.uid(),'admin','payout_'||_status,'referral_payout',p.id,p.referral_profile_id,'Payout reviewed',jsonb_build_object('reference',_reference,'notes',_notes,'amount_cents',p.amount_cents));
END $$;
REVOKE ALL ON FUNCTION public.review_affiliate_payout(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_affiliate_payout(uuid,text,text,text) TO authenticated,service_role;