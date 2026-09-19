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

import { effectiveDailyLimit } from "@/lib/mailbox-provider-limits";
import type { MailHost } from "@/lib/mailbox-auth-check";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type SelfConnectedMailbox = {
  workspace_id: string;
  email_address: string;
  display_name?: string | null;
  daily_send_limit?: number | null;
  /** Detected mail host, used to cap volume at what that host tolerates. */
  mail_host?: string | null;
};

/**
 * Daily volume for the bookkeeping row: the customer's own setting, held down to
 * what their mail host tolerates. This can only ever lower the number.
 */
function cappedDailyLimit(row: SelfConnectedMailbox): number | null {
  const configured = Number(row.daily_send_limit ?? 0);
  if (!configured) return null;
  return effectiveDailyLimit(configured, (row.mail_host as MailHost | null) ?? null);
}

/** Returns the sending_accounts id for this self-connected address. */
export async function ensureSelfConnectedSendingAccount(
  admin: Admin,
  row: SelfConnectedMailbox,
): Promise<string | null> {
  const email = (row.email_address ?? "").trim().toLowerCase();
  if (!row.workspace_id || !email) return null;
  const dailyLimit = cappedDailyLimit(row);

  const { data: existing } = await admin
    .from("sending_accounts")
    .select("id, daily_limit")
    .eq("workspace_id", row.workspace_id)
    .eq("from_email", email)
    .maybeSingle();
  const existingRow = existing as { id: string; daily_limit: number | null } | null;
  if (existingRow) {
    // Keep an already-created row inside the host ceiling, never above it.
    if (dailyLimit !== null && Number(existingRow.daily_limit ?? 0) > dailyLimit) {
      await admin
        .from("sending_accounts")
        .update({ daily_limit: dailyLimit })
        .eq("id", existingRow.id);
    }
    return existingRow.id;
  }

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
      ...(dailyLimit ? { daily_limit: dailyLimit } : {}),
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
    const base = "workspace_id, email_address, display_name, daily_send_limit, status, is_active";
    // `mail_host` is additive; before it is deployed the sync still runs without it.
    let data: unknown[] | null = null;
    const withHost = await admin
      .from("mailboxes")
      .select(`${base}, mail_host`)
      .eq("workspace_id", workspaceId)
      .eq("status", "connected");
    if (withHost.error) {
      const fallback = await admin
        .from("mailboxes")
        .select(base)
        .eq("workspace_id", workspaceId)
        .eq("status", "connected");
      data = fallback.data ?? [];
    } else {
      data = withHost.data ?? [];
    }
    const rows = (data ?? []) as (SelfConnectedMailbox & { is_active: boolean | null })[];
    for (const row of rows) {
      if (row.is_active === false) continue;
      await ensureSelfConnectedSendingAccount(admin, row);
    }
  } catch {
    /* listing must keep working even if bookkeeping cannot be written */
  }
}
