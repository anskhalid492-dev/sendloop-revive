-- Mailbox junk/spam folder polling (additive, rerunnable)
--
-- Genuine replies and bounce reports are regularly filed into a mailbox's
-- Junk/Spam folder by the mail host. Reply detection now reads that folder as
-- well as the inbox, and needs its own UID cursor so the same message is never
-- processed twice.
--
-- Nothing is dropped, rewritten or backfilled: existing inbox polling and all
-- campaign/warmup behaviour are untouched.

ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS last_spam_imap_uid integer;

COMMENT ON COLUMN public.mailboxes.last_spam_imap_uid IS
  'Highest IMAP UID already processed in the mailbox spam/junk folder.';
