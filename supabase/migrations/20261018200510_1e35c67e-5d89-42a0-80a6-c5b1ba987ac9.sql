REVOKE EXECUTE ON FUNCTION public.affiliate_dashboard_stats(),public.save_affiliate_payout_details(text,text) FROM authenticated,anon,PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_dashboard_stats(),public.save_affiliate_payout_details(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.affiliate_private_summary(_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',_user_id::text,true); RETURN public.affiliate_dashboard_stats(); END $$;
REVOKE ALL ON FUNCTION public.affiliate_private_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_private_summary(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.affiliate_private_preferences(_user_id uuid,_method text,_details text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',_user_id::text,true); PERFORM public.save_affiliate_payout_details(_method,_details); END $$;
REVOKE ALL ON FUNCTION public.affiliate_private_preferences(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_private_preferences(uuid,text,text) TO service_role;