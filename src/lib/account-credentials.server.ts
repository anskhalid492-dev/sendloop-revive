/**
 * Credential resolution for a sending mailbox.
 *
 * MunchReach runs managed sending: the provider credentials are owned by
 * MunchReach and stored in `email_provider_secrets` (or a platform environment
 * secret). Customers never supply provider API keys. Legacy per-mailbox
 * secrets are only consulted for mailboxes with no managed provider linked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function loadAccountCredentials(
  admin: Admin,
  account: { id: string; provider_id: string | null; provider?: string | null },
): Promise<Record<string, string> | null> {
  const { readCredentials } = await import("@/lib/providers/adapter.server");
  const { platformKeyFor } = await import("@/lib/managed-sending.server");

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
        /* fall through to the platform key */
      }
    }
  }

  const platformKey = account.provider ? platformKeyFor(account.provider) : null;
  if (platformKey) return { api_key: platformKey };

  // Legacy mailboxes connected before managed sending kept their own secret.
  const { data: own } = await admin
    .from("sending_account_secrets")
    .select("credentials_ciphertext")
    .eq("sending_account_id", account.id)
    .maybeSingle();
  if (own?.credentials_ciphertext) {
    try {
      return readCredentials(own.credentials_ciphertext);
    } catch {
      return null;
    }
  }
  return null;
}

