REVOKE ALL ON FUNCTION public.run_warmup_runner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_warmup_runner() TO postgres, service_role;
REVOKE ALL ON FUNCTION public.run_campaign_scheduler() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_campaign_scheduler() TO postgres, service_role;
REVOKE ALL ON FUNCTION public.run_inbound_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_inbound_retry() TO postgres, service_role;