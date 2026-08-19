ALTER FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role, text)
  SET search_path TO public, extensions;
ALTER FUNCTION public.resend_workspace_invitation(uuid)
  SET search_path TO public, extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE TABLE IF NOT EXISTS public.workspace_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid,
  target_user_id uuid,
  target_email text,
  type text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_activity_ws_idx
  ON public.workspace_activity (workspace_id, created_at DESC);
GRANT SELECT ON public.workspace_activity TO authenticated;
GRANT ALL ON public.workspace_activity TO service_role;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_activity_select ON public.workspace_activity;
CREATE POLICY workspace_activity_select ON public.workspace_activity
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.log_workspace_member_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
    SELECT email INTO em FROM public.profiles WHERE id = OLD.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (OLD.workspace_id, auth.uid(), OLD.user_id, em, 'member_removed',
            coalesce(em, 'A teammate') || ' was removed from the workspace');
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS workspace_members_activity ON public.workspace_members;
CREATE TRIGGER workspace_members_activity
AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.log_workspace_member_activity();

CREATE OR REPLACE FUNCTION public.log_workspace_invitation_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_email, type, detail)
    VALUES (NEW.workspace_id, NEW.invited_by, NEW.email, 'invitation_sent',
            NEW.email || ' was invited as ' || NEW.role::text);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (NEW.workspace_id, NEW.accepted_by, NEW.accepted_by, NEW.email, 'invitation_accepted',
            NEW.email || ' accepted the invitation');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS workspace_invitations_activity ON public.workspace_invitations;
CREATE TRIGGER workspace_invitations_activity
AFTER INSERT OR UPDATE ON public.workspace_invitations
FOR EACH ROW EXECUTE FUNCTION public.log_workspace_invitation_activity();

CREATE OR REPLACE FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role workspace_role, _message text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public, extensions
AS $function$
DECLARE
  clean_email text := lower(trim(_email));
  new_token text := encode(gen_random_bytes(24), 'hex');
  new_id uuid;
  recent integer;
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
  SELECT count(*) INTO recent FROM public.workspace_invitations i
   WHERE i.workspace_id = _workspace_id AND i.created_at > now() - interval '1 hour';
  IF recent >= 20 THEN
    RAISE EXCEPTION 'Invitation limit reached for this workspace. Try again in an hour.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations i
     WHERE i.workspace_id = _workspace_id AND lower(i.email) = clean_email
       AND i.created_at > now() - interval '2 minutes'
  ) THEN
    RAISE EXCEPTION 'An invitation was just sent to that email. Please wait a moment before trying again.';
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
END; $function$;

CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(_invitation_id uuid)
 RETURNS TABLE(id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public, extensions
AS $function$
DECLARE ws uuid; new_token text := encode(gen_random_bytes(24), 'hex'); last_sent timestamptz;
BEGIN
  SELECT workspace_id, updated_at INTO ws, last_sent
    FROM public.workspace_invitations WHERE workspace_invitations.id = _invitation_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF last_sent > now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'This invitation was just sent. Please wait a couple of minutes before resending.';
  END IF;
  UPDATE public.workspace_invitations
  SET token = new_token, expires_at = now() + interval '14 days', status = 'pending'
  WHERE workspace_invitations.id = _invitation_id;
  RETURN QUERY SELECT _invitation_id, new_token;
END; $function$;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid,
  author_role text NOT NULL DEFAULT 'customer',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON public.support_ticket_messages (ticket_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'support'::public.app_role));
DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
CREATE POLICY support_tickets_insert ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;
CREATE POLICY support_tickets_update ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'support'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'support'::public.app_role));

DROP POLICY IF EXISTS support_messages_select ON public.support_ticket_messages;
CREATE POLICY support_messages_select ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'support'::public.app_role))));
DROP POLICY IF EXISTS support_messages_insert ON public.support_ticket_messages;
CREATE POLICY support_messages_insert ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'support'::public.app_role))));

DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "avatars read own" ON storage.objects;
CREATE POLICY "avatars read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars insert own" ON storage.objects;
CREATE POLICY "avatars insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars update own" ON storage.objects;
CREATE POLICY "avatars update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars delete own" ON storage.objects;
CREATE POLICY "avatars delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);