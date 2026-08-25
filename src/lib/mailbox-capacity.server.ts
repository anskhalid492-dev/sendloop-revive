/**
 * Server-side mailbox capacity checks for manual sending.
 *
 * The hourly count is derived from the authoritative outbound message registry
 * so the check is accurate immediately before a send (no stale frontend state
 * and no second counter to keep in sync).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MAILBOX_LIMIT_CODE,
  evaluateMailboxCapacity,
  mailboxBlockedCopy,
  type MailboxCapacity,
  type MailboxCapacityRow,
} from "@/lib/mailbox-capacity";

export async function hourlySentByAccount(accountIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (accountIds.length === 0) return counts;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const { data } = await supabaseAdmin
      .from("outbound_messages")
      .select("sending_account_id")
      .in("sending_account_id", accountIds)
      .gte("created_at", since);
    for (const row of (data ?? []) as { sending_account_id: string | null }[]) {
      if (!row.sending_account_id) continue;
      counts[row.sending_account_id] = (counts[row.sending_account_id] ?? 0) + 1;
    }
  } catch {
    /* a registry read failure must not block manual sending on daily capacity */
  }
  return counts;
}

export async function loadMailboxCapacities(
  rows: MailboxCapacityRow[],
): Promise<MailboxCapacity[]> {
  const hourly = await hourlySentByAccount(rows.map((row) => row.id));
  return rows.map((row) => evaluateMailboxCapacity(row, hourly[row.id] ?? 0));
}

/**
 * Throws a recognisable capacity error when the mailbox cannot send right now.
 * Called immediately before handing the email to the provider.
 */
export async function assertMailboxCapacity(row: MailboxCapacityRow): Promise<MailboxCapacity> {
  const hourly = await hourlySentByAccount([row.id]);
  const capacity = evaluateMailboxCapacity(row, hourly[row.id] ?? 0);
  if (!capacity.available) {
    throw new Error(`${MAILBOX_LIMIT_CODE}: ${mailboxBlockedCopy(capacity)}`);
  }
  return capacity;
}
