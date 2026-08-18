GRANT sandbox_exec TO postgres WITH INHERIT TRUE, SET TRUE;
SET ROLE sandbox_exec;

ALTER TABLE public.newsletter_subscribers
  ADD CONSTRAINT newsletter_subscribers_email_unique UNIQUE (email);

CREATE TABLE public.sending_account_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sending_account_audit_workspace_idx
  ON public.sending_account_audit (workspace_id, created_at DESC);
CREATE INDEX sending_account_audit_account_idx
  ON public.sending_account_audit (sending_account_id, created_at DESC);

GRANT SELECT ON public.sending_account_audit TO authenticated;
GRANT ALL ON public.sending_account_audit TO service_role;

ALTER TABLE public.sending_account_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read sending account audit"
  ON public.sending_account_audit FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.set_sending_accounts_paused(_account_ids uuid[], _paused boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare affected integer;
begin
  if _account_ids is null or array_length(_account_ids, 1) is null then return 0; end if;
  if exists (
    select 1 from public.sending_accounts sa
    where sa.id = any(_account_ids)
      and (sa.workspace_id is null
        or not public.has_workspace_role(sa.workspace_id, auth.uid(),
             array['owner','admin','campaign_manager']::public.workspace_role[]))
  ) then raise exception 'Not authorized for one or more sending accounts'; end if;
  update public.sending_accounts set customer_enabled = not _paused, updated_at = now()
  where id = any(_account_ids);
  insert into public.sending_account_audit (workspace_id, sending_account_id, actor_id, action, detail)
  select sa.workspace_id, sa.id, auth.uid(),
         case when _paused then 'pause' else 'resume' end,
         case when _paused then 'Sending paused for ' || sa.from_email
              else 'Sending resumed for ' || sa.from_email end
  from public.sending_accounts sa
  where sa.id = any(_account_ids) and sa.workspace_id is not null;
  select count(*) into affected from public.sending_accounts where id = any(_account_ids);
  return affected;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.sending_accounts sa
    where sa.id = _account_id
      and sa.workspace_id is not null
      and public.has_workspace_role(
        sa.workspace_id, auth.uid(),
        array['owner','admin','campaign_manager']::public.workspace_role[]
      )
  ) then
    raise exception 'Not authorized for this sending account';
  end if;

  update public.sending_accounts
  set customer_enabled = _enabled, updated_at = now()
  where id = _account_id;

  insert into public.sending_account_audit (workspace_id, sending_account_id, actor_id, action, detail)
  select sa.workspace_id, sa.id, auth.uid(),
         case when _enabled then 'resume' else 'pause' end,
         case when _enabled then 'Sending resumed for ' || sa.from_email
              else 'Sending paused for ' || sa.from_email end
  from public.sending_accounts sa where sa.id = _account_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.request_sending_account_release(_account_ids uuid[], _note text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare ws uuid; request_id uuid;
begin
  if _account_ids is null or array_length(_account_ids, 1) is null then
    raise exception 'No sending accounts selected'; end if;
  select distinct sa.workspace_id into ws from public.sending_accounts sa
    where sa.id = any(_account_ids) limit 1;
  if ws is null then raise exception 'Sending accounts not found'; end if;
  if exists (
    select 1 from public.sending_accounts sa where sa.id = any(_account_ids)
      and (sa.workspace_id is distinct from ws
        or not public.has_workspace_role(ws, auth.uid(),
             array['owner','admin']::public.workspace_role[]))
  ) then raise exception 'Not authorized for one or more sending accounts'; end if;
  update public.sending_accounts set customer_enabled = false, updated_at = now()
    where id = any(_account_ids);
  insert into public.sending_account_requests (workspace_id, requested_by, kind, quantity, note, account_ids)
  values (ws, auth.uid(), 'release', array_length(_account_ids,1)::smallint, _note, _account_ids)
  returning id into request_id;
  insert into public.sending_account_audit (workspace_id, sending_account_id, actor_id, action, detail)
  select sa.workspace_id, sa.id, auth.uid(), 'remove_requested',
         'Removal requested for ' || sa.from_email || coalesce(' — ' || _note, '')
  from public.sending_accounts sa where sa.id = any(_account_ids);
  return request_id;
end; $function$;

RESET ROLE;