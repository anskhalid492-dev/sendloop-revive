REVOKE EXECUTE ON FUNCTION public.review_affiliate_payout(uuid,text,text,text),public.review_affiliate_commission(uuid,text,text) FROM anon,PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_referral_profile(),public.request_referral_payout(integer,text,text) FROM anon,PUBLIC;
ALTER FUNCTION public.affiliate_program_public() SECURITY INVOKER;
GRANT SELECT(enabled,operational_verified_at,monthly_commission_percent,monthly_paid_periods,lifetime_commission_percent,annual_commission_percent,cookie_duration_days,affiliate_approval_required,commission_type,minimum_payout_cents,attribution_window_days,approval_mode,approval_delay_days,payout_schedule,payout_methods,payout_provider_configured,eligibility,terms,singleton) ON public.referral_programs TO anon;
CREATE POLICY "Visitors read public affiliate terms" ON public.referral_programs FOR SELECT TO anon USING(singleton);
REVOKE EXECUTE ON FUNCTION public.process_affiliate_payment(jsonb) FROM anon,authenticated,PUBLIC;