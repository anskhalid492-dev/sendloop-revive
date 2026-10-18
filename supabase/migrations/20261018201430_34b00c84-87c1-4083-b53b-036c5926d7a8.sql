DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.request_referral_payout(integer,text,text)'::regprocedure) INTO definition;
definition:=replace(definition,'WHERE referral_profile_id=prof.id AND currency=''usd'' AND affiliate_environment=''live'' AND status IN','WHERE referral_profile_id=prof.id AND currency=''usd'' AND status IN'); EXECUTE definition;
SELECT pg_get_functiondef('public.affiliate_dashboard_stats()'::regprocedure) INTO definition;
definition:=replace(definition,'FROM public.referral_payouts WHERE referral_profile_id=pid AND status IN(''requested'',''under_review'',''approved'',''processing'') AND currency=''usd'' AND affiliate_environment=''live''','FROM public.referral_payouts WHERE referral_profile_id=pid AND status IN(''requested'',''under_review'',''approved'',''processing'') AND currency=''usd'''); EXECUTE definition;
SELECT pg_get_functiondef('public.review_affiliate_payout(uuid,text,text,text)'::regprocedure) INTO definition;
definition:=replace(definition,'IF available<p.amount_cents THEN','available:=available-coalesce((SELECT sum(greatest(settled_cents-(commission_amount_cents-reversed_cents),0)) FROM public.referral_commissions WHERE referral_profile_id=p.referral_profile_id AND affiliate_environment=''live'' AND currency=p.currency AND status NOT IN(''approved'',''paid'')),0); IF available<p.amount_cents THEN');
definition:=replace(definition,'END LOOP;'||chr(10)||' END IF;', 'END LOOP;'||chr(10)||' IF remaining<>0 THEN RAISE EXCEPTION ''Incomplete payout allocation; retry review''; END IF;'||chr(10)||' END IF;'); EXECUTE definition;
SELECT pg_get_functiondef('public.process_affiliate_payment(jsonb)'::regprocedure) INTO definition;
definition:=replace(definition,'IF delta<>0 THEN','IF delta<>0 AND c.status<>''reversed'' THEN'); EXECUTE definition;
END $$;
REVOKE EXECUTE ON FUNCTION public.review_affiliate_payout(uuid,text,text,text) FROM anon,PUBLIC;
REVOKE EXECUTE ON FUNCTION public.affiliate_dashboard_stats(),public.process_affiliate_payment(jsonb) FROM authenticated,anon,PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_dashboard_stats(),public.process_affiliate_payment(jsonb) TO service_role;