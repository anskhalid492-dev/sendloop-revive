ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS last_imap_uid integer;