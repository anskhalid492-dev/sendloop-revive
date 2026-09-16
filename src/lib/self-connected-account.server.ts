/**
 * Bookkeeping rows for self-connected mailboxes.
 *
 * A mailbox the customer connected themselves lives in `mailboxes` and holds its
 * own (encrypted) credentials. Several older surfaces — the Unified Inbox
 * composer, conversations, warm-up — still reference a `sending_accounts` row by
 * id. This helper makes sure such a row exists for the address, WITHOUT ever
 * storing credentials on it: the row is a pointer, never a credential source.
 *
 * Server-only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type SelfConnectedMailbox = {
  workspace_id: string;
  email_address: string;
  display_name?: string | null;
  daily_send_limit?: number | null;
};

/** Returns the sending_accounts id for this self-connected address. */
export async function ensureSelfConnectedSendingAccount(
  admin: Admin,
  row: SelfConnectedMailbox,
): Promise<string | null> {
  const email = (row.email_address ?? "").trim().toLowerCase();
  if (!row.workspace_id || !email) return null;

  const { data: existing } = await admin
    .from("sending_accounts")
    .select("id")
    .eq("workspace_id", row.workspace_id)
    .eq("from_email", email)
    .maybeSingle();
  const existingId = (existing as { id: string } | null)?.id ?? null;
  if (existingId) return existingId;

  const { data: created, error } = await admin
    .from("sending_accounts")
    .insert({
      workspace_id: row.workspace_id,
      // Self-connected: the credentials live with the mailbox, not here.
      provider: "smtp",
      connection_method: "self_connected",
      label: email,
      from_name: row.display_name ?? email.split("@")[0] ?? email,
      from_email: email,
      // The connection was proven by the mailbox login test.
      status: "verified",
      customer_enabled: true,
      paused: false,
      ...(row.daily_send_limit ? { daily_limit: row.daily_send_limit } : {}),
    })
    .select("id")
    .single();
  if (error) return null;
  return (created as { id: string }).id;
}

/**
 * Makes every usable self-connected mailbox in the workspace selectable through
 * the legacy `sending_accounts` surfaces. Never throws: a failure here must not
 * break listing the mailboxes that already work.
 */
export async function syncSelfConnectedSendingAccounts(
  admin: Admin,
  workspaceId: string,
): Promise<void> {
  try {
    const { data } = await admin
      .from("mailboxes")
      .select("workspace_id, email_address, display_name, daily_send_limit, status, is_active")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected");
    const rows = (data ?? []) as (SelfConnectedMailbox & { is_active: boolean | null })[];
    for (const row of rows) {
      if (row.is_active === false) continue;
      await ensureSelfConnectedSendingAccount(admin, row);
    }
  } catch {
    /* listing must keep working even if bookkeeping cannot be written */
  }
}
