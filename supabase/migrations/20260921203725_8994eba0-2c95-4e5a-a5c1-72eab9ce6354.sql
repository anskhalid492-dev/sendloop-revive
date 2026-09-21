REVOKE ALL ON FUNCTION public.consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.release_workspace_usage_v2(uuid, text, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_workspace_usage_v2(uuid, text, bigint, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.release_workspace_usage_v2(uuid, text, bigint, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_workspace_usage_v2(uuid, text, bigint, text, text) TO service_role;