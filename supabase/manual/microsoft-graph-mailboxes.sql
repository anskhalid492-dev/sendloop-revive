-- Microsoft 365 (Graph) mailbox tokens. ADDITIVE ONLY: creates one new table.
-- No existing table, row or policy is changed. Owner applies manually to production.
-- Rollback (only while no Microsoft mailbox is connected): DROP TABLE public.microsoft_mailbox_tokens;
CREATE TABLE IF NOT EXISTS public.microsoft_mailbox_tokens (
  mailbox_id uuid PRIMARY KEY REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  microsoft_user_id text NOT NULL,
  email_address text NOT NULL,
  encrypted_tokens text,                 -- AES-256-GCM (PROVIDER_CREDENTIALS_KEY); null after disconnect/revocation
  access_expires_at timestamptz,
  token_version integer NOT NULL DEFAULT 0,  -- compare-and-swap for refresh-token rotation
  granted_scopes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','error','revoked')),
  last_error text,
  inbox_cursor timestamptz,
  junk_cursor timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.microsoft_mailbox_tokens FROM anon, authenticated;
GRANT ALL ON public.microsoft_mailbox_tokens TO service_role;
ALTER TABLE public.microsoft_mailbox_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only server code (service role) may read or write tokens.
CREATE OR REPLACE FUNCTION public.microsoft_mailbox_tokens_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS microsoft_mailbox_tokens_touch ON public.microsoft_mailbox_tokens;
CREATE TRIGGER microsoft_mailbox_tokens_touch BEFORE UPDATE ON public.microsoft_mailbox_tokens
  FOR EACH ROW EXECUTE FUNCTION public.microsoft_mailbox_tokens_touch();

-- Verification (read-only):
-- SELECT count(*) FROM public.microsoft_mailbox_tokens;                         -- expect 0
-- SELECT count(*) FROM public.mailboxes WHERE smtp_host = 'graph.microsoft.com'; -- expect 0 before first connect
-- SELECT has_table_privilege('authenticated','public.microsoft_mailbox_tokens','SELECT'); -- expect false
