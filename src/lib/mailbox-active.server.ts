/**
 * The Active/Inactive gate for self-connected mailboxes (`mailboxes.is_active`).
 *
 * A mailbox is only usable when it is BOTH `status = 'connected'` AND
 * `is_active = true`. The status field describes the connection; `is_active` is
 * the customer's own pause switch and is independent of it.
 *
 * `findCustomerMailbox` already refuses an inactive mailbox (it returns null,
 * exactly like "no connected mailbox"). This module exists so the refusal
 * branches can tell the customer *why* — and it lives in its own file so tests
 * that mock `customer-mailbox-send.server` are unaffected.
 *
 * Server-only.
 */

/** The single user-facing wording for a paused mailbox, used everywhere. */
export const PAUSED_MAILBOX_MESSAGE =
  "This mailbox is paused. Reactivate it under Email Accounts to use it.";

/**
 * True when a mailbox row exists for this sender but the customer has paused it.
 * Never throws: on any read problem it reports false, so callers fall back to
 * their generic "no connected mailbox" wording.
 */
export async function isMailboxPaused(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  workspaceId: string,
  fromEmail: string,
): Promise<boolean> {
  const email = (fromEmail ?? "").trim().toLowerCase();
  if (!workspaceId || !email) return false;
  try {
    const { data } = await admin
      .from("mailboxes")
      .select("is_active")
      .eq("workspace_id", workspaceId)
      .eq("email_address", email)
      .maybeSingle();
    return (data as { is_active?: boolean } | null)?.is_active === false;
  } catch {
    return false;
  }
}
