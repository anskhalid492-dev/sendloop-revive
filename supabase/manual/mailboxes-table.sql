-- Run manually against the LIVE production project (rihgzkofoxcjljlbvbya).
-- Purely additive: creates the new customer mailbox-connection table.
-- Safe to run more than once (guards included).

CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  display_name text,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL,
  smtp_secure boolean NOT NULL DEFAULT true,
  smtp_username text NOT NULL,
  smtp_password uuid,
  imap_host text NOT NULL,
  imap_port integer NOT NULL,
  imap_secure boolean NOT NULL DEFAULT true,
  imap_username text NOT NULL,
  imap_password uuid,
  daily_send_limit integer NOT NULL DEFAULT 50,
  warmup_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailboxes_status_check CHECK (status IN ('pending','connected','failed')),
  CONSTRAINT mailboxes_workspace_email_unique UNIQUE (workspace_id, email_address)
);

CREATE INDEX IF NOT EXISTS mailboxes_workspace_idx ON public.mailboxes (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailboxes TO authenticated;
GRANT ALL ON public.mailboxes TO service_role;

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mailboxes_select_members ON public.mailboxes;
CREATE POLICY mailboxes_select_members ON public.mailboxes
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS mailboxes_insert_members ON public.mailboxes;
CREATE POLICY mailboxes_insert_members ON public.mailboxes
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS mailboxes_update_members ON public.mailboxes;
CREATE POLICY mailboxes_update_members ON public.mailboxes
FOR UPDATE TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS mailboxes_delete_admins ON public.mailboxes;
CREATE POLICY mailboxes_delete_admins ON public.mailboxes
FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

DROP TRIGGER IF EXISTS mailboxes_set_updated_at ON public.mailboxes;
CREATE TRIGGER mailboxes_set_updated_at
BEFORE UPDATE ON public.mailboxes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Encrypted password storage helpers (Supabase Vault). Trusted server code only.
CREATE OR REPLACE FUNCTION public.mailbox_store_secret(_value text, _label text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT vault.create_secret(_value, coalesce(_label, 'mailbox-' || gen_random_uuid()::text)) INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.mailbox_store_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailbox_store_secret(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mailbox_read_secret(_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  _value text;
BEGIN
  SELECT decrypted_secret INTO _value FROM vault.decrypted_secrets WHERE id = _id;
  RETURN _value;
END;
$$;

REVOKE ALL ON FUNCTION public.mailbox_read_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailbox_read_secret(uuid) TO service_role;
