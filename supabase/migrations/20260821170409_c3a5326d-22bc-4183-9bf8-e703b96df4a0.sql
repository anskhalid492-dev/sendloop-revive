REVOKE ALL ON FUNCTION public.run_provider_health_runner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_provider_health_runner() TO postgres, service_role;