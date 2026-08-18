/**
 * Credential resolution for a sending mailbox.
 *
 * Customer-connected mailboxes store their own encrypted credentials in
 * `sending_account_secrets` (service-role only, never readable from the
 * browser). Legacy Sendloop-operated mailboxes fall back to the shared
 * provider credentials in `email_provider_secrets`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function loadAccountCredentials(
  admin: Admin,
  account: { id: string; provider_id: string | null },
): Promise<Record<string, string> | null> {
  const { readCredentials } = await import("@/lib/providers/adapter.server");

  const { data: own } = await admin
    .from("sending_account_secrets")
    .select("credentials_ciphertext")
    .eq("sending_account_id", account.id)
    .maybeSingle();
  if (own?.credentials_ciphertext) {
    try {
      return readCredentials(own.credentials_ciphertext);
    } catch {
      /* fall through to shared provider credentials */
    }
  }

  if (account.provider_id) {
    const { data: shared } = await admin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", account.provider_id)
      .maybeSingle();
    if (shared?.credentials_ciphertext) {
      try {
        return readCredentials(shared.credentials_ciphertext);
      } catch {
        return null;
      }
    }
  }
  return null;
}
