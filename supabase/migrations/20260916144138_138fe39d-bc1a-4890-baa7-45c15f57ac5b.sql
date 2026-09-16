ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS mailboxes_workspace_active_idx
  ON public.mailboxes (workspace_id, email_address)
  WHERE is_active;