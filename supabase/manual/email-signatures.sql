-- MunchReach — mailbox-level email signatures.
-- Run once against the live production database. Purely additive and safe to
-- re-run: it creates one new table with workspace-scoped access rules.

CREATE TABLE IF NOT EXISTS public.email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Signature',
  html_signature text NOT NULL DEFAULT '',
  plain_text_signature text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sender_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_signatures_mailbox_unique UNIQUE (mailbox_id)
);

CREATE INDEX IF NOT EXISTS email_signatures_workspace_idx
  ON public.email_signatures (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_signatures TO authenticated;
GRANT ALL ON public.email_signatures TO service_role;

ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_signatures_select_members ON public.email_signatures;
CREATE POLICY email_signatures_select_members ON public.email_signatures
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS email_signatures_insert_members ON public.email_signatures;
CREATE POLICY email_signatures_insert_members ON public.email_signatures
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS email_signatures_update_members ON public.email_signatures;
CREATE POLICY email_signatures_update_members ON public.email_signatures
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS email_signatures_delete_members ON public.email_signatures;
CREATE POLICY email_signatures_delete_members ON public.email_signatures
  FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP TRIGGER IF EXISTS email_signatures_set_updated_at ON public.email_signatures;
CREATE TRIGGER email_signatures_set_updated_at
  BEFORE UPDATE ON public.email_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
