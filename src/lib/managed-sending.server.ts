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
 * Server-side provider selection.
 *
 * Customers never choose a provider. MunchReach picks one from the admin-managed
 * pool (`email_providers`) using enablement, priority and health, and falls
 * back to the mailbox's recorded provider only when the pool yields nothing.
 */
export async function resolveManagedProvider(
  admin: Admin,
  account: { provider: string; provider_id: string | null; from_email?: string },
): Promise<ManagedCredentials | null> {
  const { readCredentials } = await import("@/lib/providers/adapter.server");

  const { data: pool } = await admin
    .from("email_providers")
    .select("id, provider, is_enabled, priority, status")
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  const rows = (pool ?? []) as Array<{
    id: string;
    provider: string;
    priority: number;
    status: string | null;
  }>;

  // The mailbox's pinned provider wins when it is still enabled and healthy.
  const ordered = [
    ...rows.filter((r) => r.id === account.provider_id),
    ...rows.filter((r) => r.id !== account.provider_id && r.status !== "failed"),
    ...rows.filter((r) => r.id !== account.provider_id && r.status === "failed"),
  ];

  for (const row of ordered) {
    const { data } = await admin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", row.id)
      .maybeSingle();
    if (data?.credentials_ciphertext) {
      try {
        const credentials = readCredentials(data.credentials_ciphertext);
        if (credentials && Object.keys(credentials).length > 0) {
          return {
            provider: row.provider,
            providerId: row.id,
            credentials,
            source: "provider_secret",
          };
        }
      } catch {
        /* try the next provider in the pool */
      }
    }
    const envKey = platformKeyFor(row.provider);
    if (envKey) {
      return {
        provider: row.provider,
        providerId: row.id,
        credentials: { api_key: envKey },
        source: "platform_env",
      };
    }
  }

  return loadManagedProviderCredentials(admin, account);
}

/** Persists the raw provider failure for Admin → Providers. Never shown to customers. */
export async function recordProviderIncident(
  admin: Admin,
  providerId: string | null,
  rawError: string | null,
): Promise<void> {
  if (!providerId) return;
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
  const signal = AbortSignal.timeout(10_000);
  const target = domain.toLowerCase();
  const matches = (name: string) => {
    const n = name.toLowerCase().replace(/\.$/, "");
    return n === target || target.endsWith(`.${n}`);
  };

  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${credentials["api_key"] ?? ""}` },
        signal,
      });
      const body = await res.text();
      if (!res.ok) {
        return {
          status: "error",
          detail: `Managed provider domain lookup failed [${res.status}]: ${body.slice(0, 200)}`,
        };
      }
      const json = JSON.parse(body) as { data?: Array<{ name?: string; status?: string }> };
      const list = json.data ?? [];
      const verified = list
        .filter((d) => (d.status ?? "").toLowerCase() === "verified")
        .map((d) => (d.name ?? "").toLowerCase());
      const entry = list.find((d) => matches(d.name ?? ""));
      if (!entry) {
        return {
          status: "not_verified",
          detail: `${target} is not registered with the managed sending provider.`,
          providerDomains: verified,
        };
      }
      const status = (entry.status ?? "").toLowerCase();
      return status === "verified"
        ? { status: "verified", detail: `${target} is verified with the managed provider.`, providerDomains: verified }
        : {
            status: "not_verified",
            detail: `${target} is registered but its provider status is "${status || "pending"}".`,
            providerDomains: verified,
          };
    }

    if (provider === "mailgun") {
      const res = await fetch("https://api.mailgun.net/v3/domains", {
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${credentials["api_key"] ?? ""}`).toString("base64")}`,
        },
        signal,
      });
      const body = await res.text();
      if (!res.ok) {
        return {
          status: "error",
          detail: `Managed provider domain lookup failed [${res.status}]: ${body.slice(0, 200)}`,
        };
      }
      const json = JSON.parse(body) as { items?: Array<{ name?: string; state?: string }> };
      const items = json.items ?? [];
      const verified = items
        .filter((d) => (d.state ?? "").toLowerCase() === "active")
        .map((d) => (d.name ?? "").toLowerCase());
      const entry = items.find((d) => matches(d.name ?? ""));
      if (!entry) {
        return {
          status: "not_verified",
          detail: `${target} is not registered with the managed sending provider.`,
          providerDomains: verified,
        };
      }
      return (entry.state ?? "").toLowerCase() === "active"
        ? { status: "verified", detail: `${target} is active with the managed provider.`, providerDomains: verified }
        : {
            status: "not_verified",
            detail: `${target} is registered but its provider state is "${entry.state ?? "unknown"}".`,
            providerDomains: verified,
          };
    }

    return {
      status: "unknown",
      detail: `${provider} does not expose a domain verification API; verification is enforced at send time.`,
    };
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

