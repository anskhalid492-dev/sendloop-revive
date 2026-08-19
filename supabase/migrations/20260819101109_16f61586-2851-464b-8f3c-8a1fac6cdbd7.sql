CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.campaign_test_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  recipient_email text NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  provider_response text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','error')),
  error text,
  webhook_event_id uuid REFERENCES public.email_events(id) ON DELETE SET NULL,
  webhook_status text,
  webhook_event_type text,
  webhook_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, recipient_email)
);

GRANT SELECT, INSERT, UPDATE ON public.campaign_test_sends TO authenticated;
GRANT ALL ON public.campaign_test_sends TO service_role;
ALTER TABLE public.campaign_test_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read campaign test diagnostics"
ON public.campaign_test_sends FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Campaign managers create campaign test diagnostics"
ON public.campaign_test_sends FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND public.has_workspace_role(
    workspace_id,
    auth.uid(),
    ARRAY['owner','admin','campaign_manager']::public.workspace_role[]
  )
);

CREATE POLICY "Campaign managers update campaign test diagnostics"
ON public.campaign_test_sends FOR UPDATE TO authenticated
USING (
  requested_by = auth.uid()
  AND public.has_workspace_role(
    workspace_id,
    auth.uid(),
    ARRAY['owner','admin','campaign_manager']::public.workspace_role[]
  )
)
WITH CHECK (
  requested_by = auth.uid()
  AND public.has_workspace_role(
    workspace_id,
    auth.uid(),
    ARRAY['owner','admin','campaign_manager']::public.workspace_role[]
  )
);

CREATE INDEX campaign_test_sends_campaign_created_idx
ON public.campaign_test_sends (campaign_id, created_at DESC);
CREATE INDEX campaign_test_sends_provider_message_idx
ON public.campaign_test_sends (provider_message_id)
WHERE provider_message_id IS NOT NULL;

CREATE TRIGGER campaign_test_sends_updated_at
BEFORE UPDATE ON public.campaign_test_sends
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role workspace_role, _message text DEFAULT NULL::text)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  clean_email text := lower(trim(_email));
  new_token text := encode(extensions.gen_random_bytes(24), 'hex');
  new_id uuid;
  recent integer;
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can invite teammates';
  END IF;
  IF clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Ownership cannot be granted through an invitation'; END IF;
  SELECT count(*) INTO recent FROM public.workspace_invitations i
  WHERE i.workspace_id = _workspace_id AND i.created_at > now() - interval '1 hour';
  IF recent >= 20 THEN RAISE EXCEPTION 'Invitation limit reached for this workspace. Try again in an hour.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations i
    WHERE i.workspace_id = _workspace_id AND lower(i.email) = clean_email
      AND i.created_at > now() - interval '2 minutes'
  ) THEN RAISE EXCEPTION 'An invitation was just sent to that email. Please wait a moment before trying again.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id = wm.user_id
    WHERE wm.workspace_id = _workspace_id AND lower(p.email) = clean_email
  ) THEN RAISE EXCEPTION 'That person is already a member of this workspace'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations i
    WHERE i.workspace_id = _workspace_id AND lower(i.email) = clean_email AND i.status = 'pending'
  ) THEN RAISE EXCEPTION 'There is already a pending invitation for that email'; END IF;

  INSERT INTO public.workspace_invitations (workspace_id, email, role, message, token, invited_by)
  VALUES (_workspace_id, clean_email, _role, nullif(trim(coalesce(_message,'')), ''), new_token, auth.uid())
  RETURNING workspace_invitations.id INTO new_id;
  RETURN QUERY SELECT new_id, new_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(_invitation_id uuid)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  ws uuid;
  new_token text := encode(extensions.gen_random_bytes(24), 'hex');
  last_sent timestamptz;
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
END;
$function$;