ALTER FUNCTION public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone) SECURITY INVOKER;
ALTER FUNCTION public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone) SECURITY INVOKER;
ALTER FUNCTION public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone) SECURITY INVOKER;
ALTER FUNCTION public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_by_account(uuid, timestamp with time zone, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_summary(uuid, timestamp with time zone, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;