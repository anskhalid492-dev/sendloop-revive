/**
 * Managed sending infrastructure.
 *
 * MunchReach owns the sending provider and its credentials. Customers own their
 * domain and DNS only — they never supply a Resend (or any other provider) API
 * key, and no code path in this module reads customer-supplied provider keys.
 *
 * Send flow enforced here:
 *   customer domain (DNS verified)
 *     -> provider-side verified domain (checked live with the managed provider)
 *       -> connected mailbox (sender address on that domain)
 *         -> managed provider credentials (server-side only)
 */

import type { OutboundMessage, SendResult } from "@/lib/providers/adapter.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * Customer-facing copy. These strings are deliberately provider-agnostic —
 * raw provider text never reaches a customer.
 */
export const DOMAIN_NOT_VERIFIED_MESSAGE =
  "Your sending domain is not ready for sending yet. Please complete the DNS verification for this domain.";

export const INFRA_NOT_CONFIGURED_MESSAGE =
  "Sending infrastructure is temporarily unavailable. Please try again shortly.";

export const SEND_FAILED_MESSAGE =
  "We could not send this email right now. Please try again shortly.";


export type ManagedCredentials = {
  provider: string;
  providerId: string | null;
  credentials: Record<string, string>;
  /** Where the managed key came from — never a customer-supplied value. */
  source: "provider_secret" | "platform_env";
};

export type DomainVerification = {
  status: "verified" | "not_verified" | "unknown" | "error";
  detail: string;
  /** Domains the managed provider reports as verified (diagnostics only). */
  providerDomains?: string[];
};

export function senderDomain(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase().replace(/\.$/, "");
}

/**
 * Resolves the MunchReach-managed credentials for a mailbox's provider.
 * Only admin-owned secrets (`email_provider_secrets`) or platform environment
 * secrets are considered.
 */
export async function loadManagedProviderCredentials(
  admin: Admin,
  account: { provider: string; provider_id: string | null },
): Promise<ManagedCredentials | null> {
  const { readCredentials } = await import("@/lib/providers/adapter.server");

  if (account.provider_id) {
    const { data } = await admin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", account.provider_id)
      .maybeSingle();
    if (data?.credentials_ciphertext) {
      try {
        const credentials = readCredentials(data.credentials_ciphertext);
        if (credentials && Object.keys(credentials).length > 0) {
          return {
            provider: account.provider,
            providerId: account.provider_id,
            credentials,
            source: "provider_secret",
          };
        }
      } catch {
        /* fall through to the platform environment key */
      }
    }
  }

  const envKey = platformKeyFor(account.provider);
  if (envKey) {
    return {
      provider: account.provider,
      providerId: account.provider_id,
      credentials: { api_key: envKey },
      source: "platform_env",
    };
  }
  return null;
}

/** Platform-owned provider keys, stored as server secrets. */
export function platformKeyFor(provider: string): string | null {
  const map: Record<string, string | undefined> = {
    resend: process.env["RESEND_API_KEY"],
    // SES authenticates with an access-key pair; the secret + region are read
    // server-side by the SES adapter from AWS_SES_* environment secrets.
    ses: process.env["AWS_SES_ACCESS_KEY_ID"],
    sendgrid: process.env["SENDGRID_API_KEY"],
    postmark: process.env["POSTMARK_API_KEY"],
    mailgun: process.env["MAILGUN_API_KEY"],
    brevo: process.env["BREVO_API_KEY"],
    zeptomail: process.env["ZEPTOMAIL_API_KEY"],
    emailit: process.env["EMAILIT_API_KEY"],
  };
  return map[provider] || null;
}

/**
 * Server-side provider selection at send time.
 *
 * Customers never choose a provider. The MunchReach Provider Manager routes the
 * send deterministically across the global pool (enabled, healthy, credentialed,
 * within capacity, by priority), and only falls back to the mailbox's recorded
 * provider when the pool yields nothing at all.
 */
export async function resolveManagedProvider(
  admin: Admin,
  account: { provider: string; provider_id: string | null; from_email?: string },
  options: { scope?: EmailScope } = {},
): Promise<ManagedCredentials | null> {
  const { selectProvider } = await import("@/lib/provider-pool.server");

  const key = (account.from_email ?? "").split("@")[1] ?? account.provider_id ?? "munchreach";
  const scope: EmailScope = options.scope ?? "customer";
  const selected = await selectProvider(admin, {
    key,
    currentProviderId: account.provider_id,
    requireDomainApi: false,
    scope,
  });

  if (selected) {
    return {
      provider: selected.provider,
      providerId: selected.providerId,
      credentials: selected.credentials,
      source: selected.providerId ? "provider_secret" : "platform_env",
    };
  }

  const { isProviderAllowedForScope } = await import("@/lib/provider-pool.server");
  if (!(await isProviderAllowedForScope(admin, account.provider, scope))) return null;
  return loadManagedProviderCredentials(admin, account);
}



/** Persists the raw provider failure for Admin → Providers. Never shown to customers. */
export async function recordProviderIncident(
  admin: Admin,
  providerId: string | null,
  rawError: string | null,
): Promise<void> {
  // Feed the Provider Manager's usage/error-rate signals from real sends.
  const { recordProviderUsage } = await import("@/lib/provider-pool.server");
  await recordProviderUsage(admin, providerId, rawError ? { failed: 1 } : { sent: 1 });
  if (!providerId) return;

  // Real send outcomes are the primary health signal: log the operation, then
  // recompute health from the rolling window so recoveries clear a bad status.
  try {
    const { recordProviderOperation, refreshProviderHealth } = await import(
      "@/lib/provider-health.server"
    );
    await recordProviderOperation(admin, providerId, {
      operation: "send",
      ok: !rawError,
      message: rawError,
    });
    await refreshProviderHealth(admin, providerId);
  } catch {
    /* diagnostics only — never block a send */
  }

  try {
    await admin
      .from("email_providers")
      .update(
        rawError
          ? { status: "failed", last_error: rawError.slice(0, 1000), last_tested_at: new Date().toISOString() }
          : { status: "verified", last_error: null, last_tested_at: new Date().toISOString() },
      )
      .eq("id", providerId);
  } catch {
    /* diagnostics only — never block a send */
  }
}

type CacheEntry = { at: number; value: DomainVerification };
const verificationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Asks the managed provider whether the sender domain is verified on its side.
 * Providers without a domain API return "unknown" and are not blocked.
 */
export async function checkSenderDomainVerification(
  provider: string,
  credentials: Record<string, string>,
  domain: string,
  options: { fresh?: boolean } = {},
): Promise<DomainVerification> {
  const key = `${provider}:${domain}`;
  const cached = verificationCache.get(key);
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const value = await queryDomainVerification(provider, credentials, domain);
  verificationCache.set(key, { at: Date.now(), value });
  return value;
}

async function queryDomainVerification(
  provider: string,
  credentials: Record<string, string>,
  domain: string,
): Promise<DomainVerification> {
  const target = domain.toLowerCase().replace(/\.$/, "");
  try {
    const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
    const adapter = getDomainAdapter(provider);
    if (!adapter.supportsDomainApi) {
      return {
        status: "unknown",
        detail: `${provider} does not expose a domain API; verification is enforced at send time.`,
      };
    }
    const state = await adapter.getDomainStatus(credentials, target);
    if (state.state === "verified") return { status: "verified", detail: state.detail };
    if (state.state === "failed") return { status: "error", detail: state.detail };
    if (state.state === "unknown")
      return { status: "not_verified", detail: state.detail };
    return { status: "not_verified", detail: state.detail };
  } catch (error) {
    return {
      status: "error",
      detail: `Could not reach the managed provider: ${(error as Error).message}`,
    };
  }
}

export type ManagedSendAccount = {
  id: string;
  workspace_id: string;
  provider: string;
  provider_id: string | null;
  from_email: string;
};

export type ManagedSendOutcome = SendResult & {
  verification: DomainVerification | null;
  credentialSource: ManagedCredentials["source"] | null;
};

/** Structured server-side log for every managed send attempt. */
export function logManagedSend(entry: {
  stage: "test" | "campaign" | "inbox" | "warmup";
  workspaceId: string;
  mailboxId: string;
  senderAddress: string;
  senderDomain: string;
  provider: string;
  credentialSource: string | null;
  verificationStatus: string;
  verificationDetail: string;
  result: "sent" | "blocked" | "failed";
  providerStatusCode?: number | undefined;
  providerError?: string | null;
}) {
  console.info(
    `[managed-send] ${JSON.stringify({
      ...entry,
      providerError: entry.providerError ? entry.providerError.slice(0, 400) : null,
      at: new Date().toISOString(),
    })}`,
  );
}

/**
 * The single send path for managed sending: resolves MunchReach credentials,
 * confirms the sender domain is verified with the provider, sends, and logs.
 */
export async function sendManagedEmail(
  admin: Admin,
  account: ManagedSendAccount,
  message: OutboundMessage,
  options: { stage: "test" | "campaign" | "inbox" | "warmup" },
): Promise<ManagedSendOutcome> {
  const { getAdapter } = await import("@/lib/providers/adapter.server");
  const domain = senderDomain(account.from_email);

  const managed = await resolveManagedProvider(admin, account);
  if (!managed) {
    logManagedSend({
      stage: options.stage,
      workspaceId: account.workspace_id,
      mailboxId: account.id,
      senderAddress: account.from_email,
      senderDomain: domain,
      provider: account.provider,
      credentialSource: null,
      verificationStatus: "unchecked",
      verificationDetail: "No managed credentials available",
      result: "blocked",
      providerError: INFRA_NOT_CONFIGURED_MESSAGE,
    });
    return {
      ok: false,
      message: INFRA_NOT_CONFIGURED_MESSAGE,
      verification: null,
      credentialSource: null,
    };
  }

  const verification = await checkSenderDomainVerification(
    managed.provider,
    managed.credentials,
    domain,
  );

  if (verification.status === "not_verified") {
    logManagedSend({
      stage: options.stage,
      workspaceId: account.workspace_id,
      mailboxId: account.id,
      senderAddress: account.from_email,
      senderDomain: domain,
      provider: managed.provider,
      credentialSource: managed.source,
      verificationStatus: verification.status,
      verificationDetail: verification.detail,
      result: "blocked",
      providerError: verification.detail,
    });
    return {
      ok: false,
      message: DOMAIN_NOT_VERIFIED_MESSAGE,
      providerResponse: verification.detail,
      verification,
      credentialSource: managed.source,
    };
  }

  const adapter = getAdapter(managed.provider);
  const send = await adapter.sendEmail(managed.credentials, message);

  logManagedSend({
    stage: options.stage,
    workspaceId: account.workspace_id,
    mailboxId: account.id,
    senderAddress: account.from_email,
    senderDomain: domain,
    provider: managed.provider,
    credentialSource: managed.source,
    verificationStatus: verification.status,
    verificationDetail: verification.detail,
    result: send.ok ? "sent" : "failed",
    providerStatusCode: send.statusCode,
    providerError: send.ok ? null : send.message,
  });

  // Record provider health for Admin → Providers, then sanitise the customer copy.
  await recordProviderIncident(admin, managed.providerId, send.ok ? null : send.message);

  // A 403 from the provider on an otherwise-unknown domain is a verification
  // failure — surface the customer-facing DNS message, not raw provider text.
  if (!send.ok && send.statusCode === 403 && /not verified|domain/i.test(send.message)) {
    return {
      ...send,
      message: DOMAIN_NOT_VERIFIED_MESSAGE,
      providerResponse: send.providerResponse ?? send.message,
      verification,
      credentialSource: managed.source,
    };
  }

  if (!send.ok) {
    // Raw provider text stays in the server log and Admin → Providers only.
    return {
      ...send,
      message: SEND_FAILED_MESSAGE,
      providerResponse: send.providerResponse ?? send.message,
      verification,
      credentialSource: managed.source,
    };
  }

  return { ...send, verification, credentialSource: managed.source };
}


export const CONNECTION_FAILED_MESSAGE =
  "Your email account could not connect. Please check the connection settings or contact support.";

/**
 * Strips any vendor/infrastructure identity out of a message before it reaches
 * a customer. The raw text stays in server logs and Admin → Providers.
 */
export function customerSafeMessage(raw: string | null | undefined, fallback = CONNECTION_FAILED_MESSAGE): string {
  const text = (raw ?? "").trim();
  if (!text) return fallback;
  if (/not verified|domain/i.test(text) && /verif/i.test(text)) return DOMAIN_NOT_VERIFIED_MESSAGE;
  const leaks =
    /(resend|sendgrid|mailgun|postmark|zeptomail|zoho|brevo|emailit|amazon ses|\bses\b|smtp|supabase|lovable|api[_ -]?key|https?:\/\/|\[\d{3}\]|provider)/i;
  if (leaks.test(text)) return fallback;
  return text;
}
