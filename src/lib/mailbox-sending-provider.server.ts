/**
 * Send-time provider resolution for a mailbox.
 *
 * The provider recorded on a mailbox row (`sending_accounts.provider`) is a
 * historical fact — the infrastructure that carried it when it was connected.
 * It must never be used as the credential source, because the platform's active
 * sending infrastructure changes in Admin -> Providers and a stale value points
 * at disabled infrastructure (or, worse, at a raw platform environment key that
 * still "works" while the admin believes that provider is switched off).
 *
 * Resolution order:
 *   1. the sender domain's provider, but ONLY while that provider is still
 *      enabled for the scope, healthy and in capacity (a verified domain keeps
 *      its published DNS records working);
 *   2. otherwise whichever provider the Provider Manager currently routes to.
 *
 * There is no fall back to the mailbox's stored provider or its platform
 * environment key: when nothing is currently active, the send is refused with a
 * real reason instead of being pushed through dead infrastructure.
 */
import type { EmailScope } from "@/lib/email-provider-scope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type MailboxProviderResolution = {
  provider: string;
  providerId: string | null;
  credentials: Record<string, string>;
  source: "provider_secret" | "platform_env";
  /** True when the sender domain's own provider is still carrying the send. */
  pinned: boolean;
  /** Internal detail for admin logs. Never customer-facing. */
  detail: string;
};

export type MailboxProviderAccount = {
  id: string;
  from_email: string;
  /** Historical value only — never used as a credential source. */
  provider?: string | null;
  provider_id?: string | null;
};

function senderDomain(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase().replace(/\.$/, "");
}

/**
 * Resolves the provider that must carry a send from this mailbox right now.
 * Returns `null` when no active infrastructure can carry it.
 */
export async function resolveMailboxSendingProvider(
  admin: Admin,
  account: MailboxProviderAccount,
  options: { scope?: EmailScope } = {},
): Promise<MailboxProviderResolution | null> {
  const { selectProvider } = await import("@/lib/provider-pool.server");
  const { domainIsPinnedToProvider } = await import("@/lib/domain-verification.server");
  const scope: EmailScope = options.scope ?? "customer";
  const domain = senderDomain(account.from_email);
  const key = domain || account.id;

  // The sender domain is the record that actually knows which infrastructure
  // its published DNS belongs to — not the mailbox row.
  let pinnedProvider: string | null = null;
  let pinnedProviderId: string | null = null;
  if (domain) {
    const { data } = await admin
      .from("sending_domains")
      .select("provider, provider_id, stage, verified_at, dns_status")
      .ilike("domain", domain)
      .maybeSingle();
    if (data && domainIsPinnedToProvider(data)) {
      pinnedProvider = (data.provider as string | null) ?? null;
      pinnedProviderId = (data.provider_id as string | null) ?? null;
    }
  }

  // 1. Keep the domain's own provider while it is still eligible.
  if (pinnedProvider) {
    const kept = await selectProvider(admin, {
      key,
      currentProviderId: pinnedProviderId,
      requireDomainApi: false,
      scope,
      preferredProvider: pinnedProvider,
    });
    if (kept) {
      return {
        provider: kept.provider,
        providerId: kept.providerId,
        credentials: kept.credentials,
        source: kept.providerId ? "provider_secret" : "platform_env",
        pinned: true,
        detail: `Sender domain ${domain} is verified on ${kept.provider}, which is still active.`,
      };
    }
  }

  // 2. Follow the currently active infrastructure.
  const active = await selectProvider(admin, {
    key,
    currentProviderId: null,
    requireDomainApi: false,
    scope,
    preferredProvider: null,
  });
  if (!active) return null;

  return {
    provider: active.provider,
    providerId: active.providerId,
    credentials: active.credentials,
    source: active.providerId ? "provider_secret" : "platform_env",
    pinned: false,
    detail: pinnedProvider
      ? `Sender domain ${domain} was provisioned on ${pinnedProvider}, which is no longer active; routed to ${active.provider}.`
      : `Routed to the active infrastructure ${active.provider}.`,
  };
}
