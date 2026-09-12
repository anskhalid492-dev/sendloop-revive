CREATE OR REPLACE FUNCTION public.log_workspace_member_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE em text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT email INTO em FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (NEW.workspace_id, auth.uid(), NEW.user_id, em, 'member_joined',
            coalesce(em, 'A teammate') || ' joined as ' || NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT email INTO em FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (NEW.workspace_id, auth.uid(), NEW.user_id, em, 'role_changed',
            coalesce(em, 'A teammate') || ' changed from ' || OLD.role::text || ' to ' || NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- When the whole workspace is being deleted the member rows cascade away;
    -- logging activity for a workspace that no longer exists violates the FK.
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = OLD.workspace_id) THEN
      RETURN OLD;
    END IF;
    SELECT email INTO em FROM public.profiles WHERE id = OLD.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (OLD.workspace_id, auth.uid(), OLD.user_id, em, 'member_removed',
            coalesce(em, 'A teammate') || ' was removed from the workspace');
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_workspace(_workspace_id uuid, _confirm text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ws public.workspaces; c text;
BEGIN
  SELECT * INTO ws FROM public.workspaces WHERE id = _workspace_id;
  IF ws.id IS NULL THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF ws.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Only the workspace owner can delete this workspace'; END IF;
  c := lower(trim(coalesce(_confirm,'')));
  IF c <> 'delete' AND c <> lower(ws.name) THEN
    RAISE EXCEPTION 'Type DELETE to confirm deletion';
  END IF;
  DELETE FROM public.workspaces WHERE id = _workspace_id;
END;
$$;