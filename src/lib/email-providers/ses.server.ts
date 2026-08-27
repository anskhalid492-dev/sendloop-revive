/**
 * Amazon SES adapter for the unified MunchReach provider layer.
 *
 * This is a real SES adapter: every call goes to the SESv2 API through
 * `./ses-api.server`. It is NOT a wrapper around another provider.
 *
 * Phase 9A scope — foundation only:
 *   authentication + region, domain identity create/verify, verification
 *   status, DKIM + MAIL FROM DNS requirements, account sending quota.
 * Sending, inbound, webhooks and tracking are intentionally NOT implemented
 * here and are declared `false` in the capability model.
 *
 * DNS records are always derived from what SES reports (DKIM tokens, MAIL FROM
 * configuration, region) — never hardcoded per customer — and are normalized
 * into the generic `ProviderDnsRecord` shape so the MunchReach DNS layer stays
 * provider-independent.
 *
 * Server-only.
 */
import { record, relativeHost } from "@/lib/domain-providers/adapter.server";
import {
  createSesIdentity,
  getSesAccount,
  getSesIdentity,
  refreshSesDkim,
  resolveSesCredentials,
  sesRegion,
  type SesIdentity,
} from "./ses-api.server";
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type EmailProviderCredentials,
  type ProviderDnsRecord,
  type ProviderDomainState,
  type UnifiedDomainStatus,
} from "./types";

const ID = "ses";

/* ------------------------------------------------------------------ *
 * DNS normalization
 * ------------------------------------------------------------------ */

export function sesDkimRecords(domain: string, tokens: string[]): ProviderDnsRecord[] {
  return tokens
    .filter((token) => typeof token === "string" && token.trim() !== "")
    .map((token) =>
      record({
        domain,
        kind: "dkim",
        type: "CNAME",
        host: `${token}._domainkey`,
        value: `${token}.dkim.amazonses.com`,
        ttl: 3600,
        required: true,
        purpose: "Signs every outgoing email so mailbox providers can verify it.",
      }),
    );
}

/**
 * MAIL FROM requirements exist only when the identity has a custom MAIL FROM
 * domain configured at the provider. The MX target is region-specific, so it is
 * derived from the credentials' region rather than assumed.
 */
export function sesMailFromRecords(
  domain: string,
  mailFromDomain: string | null | undefined,
  region: string,
): ProviderDnsRecord[] {
  const mailFrom = (mailFromDomain ?? "").trim().toLowerCase();
  if (!mailFrom) return [];
  const host = relativeHost(mailFrom, domain);
  return [
    record({
      domain,
      kind: "feedback",
      type: "MX",
      host,
      value: `feedback-smtp.${region}.amazonses.com`,
      priority: 10,
      ttl: 3600,
      required: true,
      purpose: "Delivers bounce and complaint feedback for your sending domain.",
    }),
    record({
      domain,
      kind: "spf",
      type: "TXT",
      host,
      value: "v=spf1 include:amazonses.com ~all",
      ttl: 3600,
      required: true,
      purpose: "Authorises MunchReach to send email as your domain.",
    }),
  ];
}

export function sesDnsRequirements(
  domain: string,
  identity: SesIdentity | null,
  region: string,
): ProviderDnsRecord[] {
  if (!identity) return [];
  return [
    ...sesDkimRecords(domain, identity.DkimAttributes?.Tokens ?? []),
    ...sesMailFromRecords(domain, identity.MailFromAttributes?.MailFromDomain, region),
  ];
}

/* ------------------------------------------------------------------ *
 * Status mapping
 * ------------------------------------------------------------------ */

export function mapSesIdentityState(identity: SesIdentity | null): ProviderDomainState {
  if (!identity) return { state: "unknown", detail: "Identity not found." };
  const dkim = (identity.DkimAttributes?.Status ?? "").toUpperCase();
  const verification = (identity.VerificationStatus ?? "").toUpperCase();
  if (identity.VerifiedForSendingStatus && dkim === "SUCCESS") {
    return { state: "verified", detail: "Identity verified for sending with DKIM success." };
  }
  if (dkim === "FAILED" || verification === "FAILED") {
    return { state: "failed", detail: "DKIM verification failed at the provider." };
  }
  return {
    state: "pending",
    detail: `DKIM status "${dkim || "PENDING"}", sending verified: ${String(
      identity.VerifiedForSendingStatus ?? false,
    )}.`,
  };
}

function unknownStatus(detail: string): UnifiedDomainStatus {
  return { state: "unknown", detail, providerDomainId: null, readyToSend: false };
}

function failedStatus(detail: string): UnifiedDomainStatus {
  return { state: "failed", detail, providerDomainId: null, readyToSend: false };
}

/* ------------------------------------------------------------------ *
 * Account quota
 * ------------------------------------------------------------------ */

export type SesSendingQuota = {
  known: boolean;
  sendingEnabled: boolean;
  productionAccess: boolean;
  max24HourSend: number | null;
  maxSendRate: number | null;
  sentLast24Hours: number | null;
  detail: string;
};

export async function getSesSendingQuota(
  creds?: EmailProviderCredentials | null,
): Promise<SesSendingQuota> {
  const res = await getSesAccount(creds);
  if (!res.ok || !res.json) {
    return {
      known: false,
      sendingEnabled: false,
      productionAccess: false,
      max24HourSend: null,
      maxSendRate: null,
      sentLast24Hours: null,
      detail: res.detail,
    };
  }
  const quota = res.json.SendQuota ?? {};
  return {
    known: true,
    sendingEnabled: res.json.SendingEnabled ?? false,
    productionAccess: res.json.ProductionAccessEnabled ?? false,
    max24HourSend: typeof quota.Max24HourSend === "number" ? quota.Max24HourSend : null,
    maxSendRate: typeof quota.MaxSendRate === "number" ? quota.MaxSendRate : null,
    sentLast24Hours: typeof quota.SentLast24Hours === "number" ? quota.SentLast24Hours : null,
    detail: `Enforcement: ${res.json.EnforcementStatus ?? "unknown"}.`,
  };
}

/** True when server-side SES credentials are available. */
export function hasSesCredentials(creds?: EmailProviderCredentials | null): boolean {
  return resolveSesCredentials(creds) !== null;
}

/* ------------------------------------------------------------------ *
 * Adapter
 * ------------------------------------------------------------------ */

export const sesEmailProvider: EmailProvider = {
  id: ID,
  label: "Amazon SES",
  // Receiving is not part of this phase; SES inbound requires separate
  // rule-set configuration and is declared unsupported until implemented.
  inboundSetupMode: "unsupported",
  capabilities: capabilities({
    sending: true,
    domain_api: true,
    dns_api: true,
  }),

  /** Phase 9B: outbound sending through the SESv2 SendEmail API. */
  async send(creds, message) {
    const { sendSesEmail } = await import("./ses-send.server");
    return sendSesEmail(creds, message);
  },

  /** Creates the identity when missing, then asks SES to re-check DNS. */
  async verifyDomain(creds, domain): Promise<UnifiedDomainStatus> {
    if (!hasSesCredentials(creds)) {
      return unknownStatus("Sending infrastructure credentials are not configured.");
    }
    const existing = await getSesIdentity(domain, creds);
    if (!existing.ok || !existing.json) {
      const created = await createSesIdentity(domain, creds);
      if (!created.ok) return failedStatus(created.detail);
      const state = mapSesIdentityState(created.json ?? { DkimAttributes: {} });
      return { ...state, providerDomainId: domain.toLowerCase(), readyToSend: false };
    }
    const refreshed = await refreshSesDkim(domain, creds);
    if (!refreshed.ok && refreshed.status >= 500) return failedStatus(refreshed.detail);
    const latest = await getSesIdentity(domain, creds);
    if (!latest.ok) return failedStatus(latest.detail);
    const state = mapSesIdentityState(latest.json);
    return {
      ...state,
      providerDomainId: domain.toLowerCase(),
      readyToSend: state.state === "verified",
    };
  },

  async getDomainStatus(creds, domain): Promise<UnifiedDomainStatus> {
    if (!hasSesCredentials(creds)) {
      return unknownStatus("Sending infrastructure credentials are not configured.");
    }
    const res = await getSesIdentity(domain, creds);
    if (!res.ok) {
      if (res.status === 404) return unknownStatus("Identity not found.");
      return failedStatus(res.detail);
    }
    const state = mapSesIdentityState(res.json);
    return {
      ...state,
      providerDomainId: res.json ? domain.toLowerCase() : null,
      readyToSend: state.state === "verified",
    };
  },

  async getDnsRequirements(creds, domain): Promise<ProviderDnsRecord[]> {
    if (!hasSesCredentials(creds)) return [];
    const res = await getSesIdentity(domain, creds);
    if (!res.ok) return [];
    return sesDnsRequirements(domain.toLowerCase(), res.json, sesRegion(creds));
  },
};
