# Connect Your Mailbox (new, self-contained)

Everything below is additive. No existing table, page, function, or the Resend system-email setup is touched.

## What gets built

1. A new `mailboxes` table with per-workspace access rules, with both passwords held in the database's encrypted secret store (Supabase Vault) rather than as readable text.
2. A new page at `/mailboxes/connect` titled "Connect Your Mailbox", with exactly the requested fields.
3. A new function `test-mailbox-connection` that performs a real SMTP login and a real IMAP login and reports pass/fail separately for each, with the provider's own error message.
4. Host/port auto-suggestion from the email domain for Gmail, Outlook/Office 365, Zoho, Hostinger, and Namecheap Private Email / Titan.

The record is saved as `connected` only when both logins pass; otherwise it stays `pending` and the two errors are shown.

## Migration SQL (exact, run as-is)

```sql
-- New, additive only. Passwords are stored as Vault secret ids, never as text.
CREATE TABLE public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  display_name text,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL,
  smtp_secure boolean NOT NULL DEFAULT true,
  smtp_username text NOT NULL,
  smtp_password uuid,           -- vault secret id (encrypted at rest by Vault)
  imap_host text NOT NULL,
  imap_port integer NOT NULL,
  imap_secure boolean NOT NULL DEFAULT true,
  imap_username text NOT NULL,
  imap_password uuid,           -- vault secret id
  daily_send_limit integer NOT NULL DEFAULT 50,
  warmup_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailboxes_status_check CHECK (status IN ('pending','connected','failed')),
  CONSTRAINT mailboxes_workspace_email_unique UNIQUE (workspace_id, email_address)
);

CREATE INDEX mailboxes_workspace_idx ON public.mailboxes (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailboxes TO authenticated;
GRANT ALL ON public.mailboxes TO service_role;

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mailboxes_select_members ON public.mailboxes
FOR SELECT TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY mailboxes_insert_members ON public.mailboxes
FOR INSERT TO authenticated
WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY mailboxes_update_members ON public.mailboxes
FOR UPDATE TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY mailboxes_delete_admins ON public.mailboxes
FOR DELETE TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(),
       ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER mailboxes_set_updated_at
BEFORE UPDATE ON public.mailboxes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Passwords are written with `vault.create_secret(...)` from the server side and read only by the connection tester; the `mailboxes` row holds just the secret id, so a leaked row exposes no password.

## New files

| File | Purpose |
| --- | --- |
| `supabase/functions/test-mailbox-connection/index.ts` | Real SMTP + IMAP login attempt over TCP, separate verdict per protocol |
| `src/lib/mailbox-presets.ts` | Domain to host/port suggestions (Gmail, Outlook/365, Zoho, Hostinger, Titan) |
| `src/lib/customer-mailboxes.functions.ts` | Test-and-save server function (Vault write, status decision) |
| `src/routes/_authenticated/mailboxes.connect.tsx` | The "Connect Your Mailbox" page and form |
| `tests/mailbox-presets.test.ts` | Preset suggestion coverage |
| `supabase/manual/mailboxes-table.sql` | Same SQL for the live database |

## Technical notes

- SMTP/IMAP need raw socket connections, which the app's own server runtime cannot make. That is why the connection tester is a Supabase function (as you asked for) rather than in-app server code — it is the only runtime here that can speak those protocols.
- Migrations run by my tools only reach the development database. The live site runs on a separate database, so the identical statements are written to `supabase/manual/mailboxes-table.sql` for you to run there.
- Nothing reads or writes `sending_accounts`, `email_providers`, or any system-email path, so onboarding@, password resets and notifications keep behaving exactly as today.
- The new page is reachable directly by URL; no existing navigation, page, or layout is edited unless you ask.
