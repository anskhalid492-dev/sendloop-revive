-- Remove table-wide column access, then re-grant every column EXCEPT the
-- webhook credentials. RLS row rules stay unchanged.
REVOKE SELECT, UPDATE ON public.automations FROM authenticated;
REVOKE SELECT, UPDATE ON public.automations FROM anon;

GRANT SELECT (
  id, workspace_id, name, description, status, trigger_type, trigger_config,
  condition_logic, version, last_run_at, created_by, created_at, updated_at
) ON public.automations TO authenticated;

GRANT UPDATE (
  name, description, status, trigger_type, trigger_config,
  condition_logic, version, last_run_at, updated_at
) ON public.automations TO authenticated;

GRANT INSERT (
  id, workspace_id, name, description, status, trigger_type, trigger_config,
  condition_logic, version, created_by, created_at, updated_at
) ON public.automations TO authenticated;

GRANT ALL ON public.automations TO service_role;