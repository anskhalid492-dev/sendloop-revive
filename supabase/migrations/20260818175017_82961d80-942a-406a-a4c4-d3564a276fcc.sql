-- ============ Campaign launch audit trail + persisted readiness ============
CREATE TABLE IF NOT EXISTS public.campaign_launch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  actor_id uuid,
  outcome text NOT NULL DEFAULT 'checked',
  ready boolean NOT NULL DEFAULT false,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  list_id uuid,
  list_name text,
  eligible integer NOT NULL DEFAULT 0,
  already_queued integer NOT NULL DEFAULT 0,
  audience integer NOT NULL DEFAULT 0,
  active_mailboxes integer NOT NULL DEFAULT 0,
  queued_messages integer NOT NULL DEFAULT 0,
  total_recipients integer NOT NULL DEFAULT 0,
  first_send_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_launch_events_campaign_idx
  ON public.campaign_launch_events (campaign_id, created_at DESC);

GRANT SELECT, INSERT ON public.campaign_launch_events TO authenticated;
GRANT ALL ON public.campaign_launch_events TO service_role;
ALTER TABLE public.campaign_launch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "launch events readable by workspace" ON public.campaign_launch_events;
CREATE POLICY "launch events readable by workspace" ON public.campaign_launch_events
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS "launch events writable by workspace" ON public.campaign_launch_events;
CREATE POLICY "launch events writable by workspace" ON public.campaign_launch_events
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS eligible_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audience_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readiness_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readiness_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS readiness_checked_at timestamptz;

-- ============ Workspace settings columns ============
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS sending_timezone text,
  ADD COLUMN IF NOT EXISTS send_days smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  ADD COLUMN IF NOT EXISTS send_start_hour smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS send_end_hour smallint NOT NULL DEFAULT 17;

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- ============ Invitations ============
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  message text,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_pending_idx
  ON public.workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending';

GRANT SELECT ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations readable by workspace admins" ON public.workspace_invitations;
CREATE POLICY "invitations readable by workspace admins" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

DROP TRIGGER IF EXISTS workspace_invitations_updated_at ON public.workspace_invitations;
CREATE TRIGGER workspace_invitations_updated_at BEFORE UPDATE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Team management functions ============
CREATE OR REPLACE FUNCTION public.workspace_team(_workspace_id uuid)
RETURNS TABLE(row_id uuid, kind text, user_id uuid, email text, full_name text, avatar_url text,
              role text, status text, joined_at timestamptz, last_active_at timestamptz,
              invited_by_email text, expires_at timestamptz, message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  SELECT m.id, 'member'::text, m.user_id, p.email, p.full_name, p.avatar_url,
         m.role::text, 'active'::text, m.created_at, m.last_active_at,
         NULL::text, NULL::timestamptz, NULL::text
  FROM public.workspace_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = _workspace_id
  UNION ALL
  SELECT i.id, 'invitation'::text, NULL::uuid, i.email, NULL::text, NULL::text,
         i.role::text, i.status, i.created_at, NULL::timestamptz,
         pi.email, i.expires_at, i.message
  FROM public.workspace_invitations i
  LEFT JOIN public.profiles pi ON pi.id = i.invited_by
  WHERE i.workspace_id = _workspace_id AND i.status = 'pending'
    AND public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  ORDER BY 9;
END; $$;

CREATE OR REPLACE FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role, _message text DEFAULT NULL)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clean_email text := lower(trim(_email));
  new_token text := encode(gen_random_bytes(24), 'hex');
  new_id uuid;
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can invite teammates';
  END IF;
  IF clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF _role = 'owner' THEN
    RAISE EXCEPTION 'Ownership cannot be granted through an invitation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id = wm.user_id
    WHERE wm.workspace_id = _workspace_id AND lower(p.email) = clean_email
  ) THEN
    RAISE EXCEPTION 'That person is already a member of this workspace';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations i
    WHERE i.workspace_id = _workspace_id AND lower(i.email) = clean_email AND i.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'There is already a pending invitation for that email';
  END IF;

  INSERT INTO public.workspace_invitations (workspace_id, email, role, message, token, invited_by)
  VALUES (_workspace_id, clean_email, _role, nullif(trim(coalesce(_message,'')), ''), new_token, auth.uid())
  RETURNING workspace_invitations.id INTO new_id;

  RETURN QUERY SELECT new_id, new_token;
END; $$;

CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(_invitation_id uuid)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid; new_token text := encode(gen_random_bytes(24), 'hex');
BEGIN
  SELECT workspace_id INTO ws FROM public.workspace_invitations WHERE workspace_invitations.id = _invitation_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  UPDATE public.workspace_invitations
  SET token = new_token, expires_at = now() + interval '14 days', status = 'pending'
  WHERE workspace_invitations.id = _invitation_id;
  RETURN QUERY SELECT _invitation_id, new_token;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_workspace_invitation(_invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid;
BEGIN
  SELECT workspace_id INTO ws FROM public.workspace_invitations WHERE id = _invitation_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  UPDATE public.workspace_invitations SET status = 'revoked' WHERE id = _invitation_id;
END; $$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.workspace_invitations; user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to accept this invitation'; END IF;
  SELECT lower(email) INTO user_email FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO inv FROM public.workspace_invitations WHERE token = _token;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'This invitation is no longer active'; END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'This invitation has expired';
  END IF;
  IF user_email IS DISTINCT FROM lower(inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to %', inv.email;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (inv.workspace_id, auth.uid(), inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  WHERE id = inv.id;

  RETURN inv.workspace_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_workspace_member_role(_member_id uuid, _role public.workspace_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid; current_role public.workspace_role;
BEGIN
  SELECT workspace_id, role INTO ws, current_role FROM public.workspace_members WHERE id = _member_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can change roles';
  END IF;
  IF current_role = 'owner' THEN RAISE EXCEPTION 'The workspace owner role cannot be changed'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Ownership cannot be assigned here'; END IF;
  UPDATE public.workspace_members SET role = _role WHERE id = _member_id;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_workspace_member(_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid; target_role public.workspace_role; target_user uuid;
BEGIN
  SELECT workspace_id, role, user_id INTO ws, target_role, target_user
  FROM public.workspace_members WHERE id = _member_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF target_user <> auth.uid()
     AND NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF target_role = 'owner' THEN RAISE EXCEPTION 'The workspace owner cannot be removed'; END IF;
  DELETE FROM public.workspace_members WHERE id = _member_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_workspace_settings(
  _workspace_id uuid, _name text, _slug text, _logo_url text, _timezone text,
  _sending_timezone text, _send_days smallint[], _send_start_hour smallint, _send_end_hour smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE clean_slug text := lower(regexp_replace(coalesce(_slug,''), '[^a-zA-Z0-9]+', '-', 'g'));
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can change workspace settings';
  END IF;
  clean_slug := trim(both '-' from clean_slug);
  IF length(coalesce(trim(_name), '')) < 2 THEN RAISE EXCEPTION 'Workspace name is too short'; END IF;
  IF length(clean_slug) < 3 THEN RAISE EXCEPTION 'Workspace URL must be at least 3 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.slug = clean_slug AND w.id <> _workspace_id) THEN
    RAISE EXCEPTION 'That workspace URL is already taken';
  END IF;
  IF _send_end_hour <= _send_start_hour THEN RAISE EXCEPTION 'Sending window end must be after the start'; END IF;

  UPDATE public.workspaces
  SET name = trim(_name), slug = clean_slug, logo_url = nullif(trim(coalesce(_logo_url,'')), ''),
      timezone = coalesce(nullif(trim(coalesce(_timezone,'')), ''), 'UTC'),
      sending_timezone = nullif(trim(coalesce(_sending_timezone,'')), ''),
      send_days = coalesce(_send_days, send_days),
      send_start_hour = _send_start_hour, send_end_hour = _send_end_hour
  WHERE id = _workspace_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_workspace(_workspace_id uuid, _confirm text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws public.workspaces;
BEGIN
  SELECT * INTO ws FROM public.workspaces WHERE id = _workspace_id;
  IF ws.id IS NULL THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF ws.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Only the workspace owner can delete this workspace'; END IF;
  IF lower(trim(coalesce(_confirm,''))) <> lower(ws.name) THEN
    RAISE EXCEPTION 'Type the workspace name exactly to confirm deletion';
  END IF;
  DELETE FROM public.workspaces WHERE id = _workspace_id;
END; $$;

CREATE OR REPLACE FUNCTION public.touch_workspace_activity(_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.workspace_members SET last_active_at = now()
  WHERE workspace_id = _workspace_id AND user_id = auth.uid();
END; $$;

REVOKE EXECUTE ON FUNCTION public.workspace_team(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_workspace_invitation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_workspace_member_role(uuid, public.workspace_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_workspace_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_workspace_settings(uuid, text, text, text, text, text, smallint[], smallint, smallint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_workspace(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_workspace_activity(uuid) FROM anon;