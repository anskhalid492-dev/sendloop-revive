/**
 * Automated SES domain provisioning (Phase 9C).
 *
 * This is the ONE place that turns "a customer added a sending domain" into a
 * managed SES domain identity. It sits behind the existing provider
 * abstraction: the customer-facing domain system only ever talks to the generic
 * domain adapter, which delegates here.
 *
 * Guarantees:
 *   - Platform-owned AWS credentials only. Customers never see AWS, never sign
 *     in to AWS, and never create an identity by hand.
 *   - Idempotent: an existing identity is reused, never recreated.
 *   - DNS records always come from SES (DKIM tokens, MAIL FROM configuration,
 *     region) and are normalized into the generic `ProviderDnsRecord` shape.
 *   - AWS failures are converted into safe, customer-neutral messages while the
 *     raw provider detail stays in the server log.
 *
 * Server-only.
 */
import { buildRootInboundMxRecord, normalizeDomain } from "./mx-host";
import {
  createSesIdentity,
  getSesIdentity,
  putSesMailFromAttributes,
  refreshSesDkim,
  resolveSesCredentials,
  sesRegion,
  type SesIdentity,
  type SesResponse,
} from "./ses-api.server";
import { mapSesIdentityState, sesDnsRequirements } from "./ses.server";
import type { EmailProviderCredentials } from "./types";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

/* ------------------------------------------------------------------ *
 * Customer-safe error mapping
 * ------------------------------------------------------------------ */

export const SES_UNAVAILABLE_MESSAGE =
  "Email infrastructure is temporarily unavailable. Please try again.";
export const SES_THROTTLED_MESSAGE =
  "Email provider temporarily unavailable. Please try again shortly.";
export const SES_CONFIGURE_FAILED_MESSAGE =
  "Unable to configure this domain with our email provider.";

/** Maps an AWS failure to a message that never leaks AWS or credential detail. */
export function safeSesMessage(status: number, detail: string): string {
  if (status === 0) return SES_UNAVAILABLE_MESSAGE;
  if (status === 429 || status === 503 || /throttl|too many requests|slow ?down/i.test(detail)) {
    return SES_THROTTLED_MESSAGE;
  }
  if (status >= 500) return SES_UNAVAILABLE_MESSAGE;
  return SES_CONFIGURE_FAILED_MESSAGE;
}

/** Raw AWS detail is log-only; it must never reach a customer response. */
function logProviderFailure(operation: string, domain: string, res: SesResponse<unknown>): void {
  console.warn(
    `[ses-provisioning] ${JSON.stringify({
      operation,
      domain,
      status: res.status,
      detail: res.detail.slice(0, 500),
      at: new Date().toISOString(),
    })}`,
  );
}

function safeState(operation: string, domain: string, res: SesResponse<unknown>): ProviderDomainState {
  logProviderFailure(operation, domain, res);
  return { state: "failed", detail: safeSesMessage(res.status, res.detail) };
}

/* ------------------------------------------------------------------ *
 * Domain normalization
 * ------------------------------------------------------------------ */

/**
 * SES identity names are bare domains. Anything the customer pastes (scheme,
 * path, trailing dot, `www.`, uppercase) is stripped before it reaches AWS.
 */
export function sesIdentityName(domain: string): string {
  return normalizeDomain(domain).replace(/^www\./, "");
}

/* ------------------------------------------------------------------ *
 * DNS assembly
 * ------------------------------------------------------------------ */

/**
 * Receiving requirement for the customer. It is informational for *sending*
 * readiness (`required: false`) so a domain that only sends is never blocked by
 * a receiving record it does not need yet.
 */
export function sesInboundMxRecord(domain: string, region: string): ProviderDnsRecord {
  return {
    ...buildRootInboundMxRecord({
      id: "ses-inbound-mx",
      domain,
      target: `inbound-smtp.${region}.amazonaws.com`,
      priority: 10,
      ttl: 3600,
      purpose: "Routes replies to your campaigns back into your MunchReach inbox.",
    }),
    required: false,
  };
}

/** Every DNS fact SES reports for this identity, plus the receiving record. */
export function sesProvisionedRecords(
  domain: string,
  identity: SesIdentity | null,
  region: string,
): ProviderDnsRecord[] {
  return [...sesDnsRequirements(domain, identity, region), sesInboundMxRecord(domain, region)];
}

/* ------------------------------------------------------------------ *
 * Provisioning
 * ------------------------------------------------------------------ */

/** Optional custom MAIL FROM subdomain, configured platform-side only. */
function mailFromSubdomain(): string | null {
  const value = (process.env["SES_MAIL_FROM_SUBDOMAIN"] ?? "").trim().toLowerCase();
  return value ? value.replace(/^\.+|\.+$/g, "") : null;
}

/**
 * Creates or reuses the SES domain identity and returns its DNS requirements.
 *
 * Idempotency: the identity is read first. When it already exists nothing is
 * created — the existing DKIM tokens and state are returned unchanged, so
 * repeated "Add domain" / "Check DNS" clicks are safe and can never overwrite a
 * verified identity.
 */
export async function provisionSesDomain(
  creds: EmailProviderCredentials | null | undefined,
  rawDomain: string,
): Promise<ProviderDomainSetup> {
  const domain = sesIdentityName(rawDomain);
  const region = sesRegion(creds);

  if (!resolveSesCredentials(creds)) {
    console.warn(`[ses-provisioning] missing platform credentials for ${domain}`);
    return {
      providerDomainId: null,
      records: [],
      state: "failed",
      detail: SES_UNAVAILABLE_MESSAGE,
    };
  }

  let identity = await getSesIdentity(domain, creds);

  if (!identity.ok || !identity.json) {
    if (identity.status !== 404 && identity.status !== 400 && identity.status !== 0) {
      return { providerDomainId: null, records: [], ...safeState("getIdentity", domain, identity) };
    }
    const created = await createSesIdentity(domain, creds);
    if (!created.ok) {
      // AlreadyExists is not a failure: fall through to reading the identity.
      if (!/already ?exists/i.test(created.detail)) {
        return {
          providerDomainId: null,
          records: [],
          ...safeState("createIdentity", domain, created),
        };
      }
    }
    identity = await getSesIdentity(domain, creds);
    if (!identity.ok || !identity.json) {
      return { providerDomainId: null, records: [], ...safeState("getIdentity", domain, identity) };
    }
  }

  // Custom MAIL FROM is optional and platform-configured; it must never be a
  // prerequisite for basic identity verification.
  const subdomain = mailFromSubdomain();
  if (subdomain && !identity.json.MailFromAttributes?.MailFromDomain) {
    const applied = await putSesMailFromAttributes(domain, `${subdomain}.${domain}`, creds);
    if (!applied.ok) logProviderFailure("putMailFrom", domain, applied);
    else identity = await getSesIdentity(domain, creds);
  }

  const state = mapSesIdentityState(identity.json);
  return {
    providerDomainId: domain,
    records: sesProvisionedRecords(domain, identity.json, region),
    ...state,
  };
}

/** Reads the SES-side identity state without creating anything. */
export async function sesDomainState(
  creds: EmailProviderCredentials | null | undefined,
  rawDomain: string,
): Promise<ProviderDomainState> {
  const domain = sesIdentityName(rawDomain);
  if (!resolveSesCredentials(creds)) {
    return { state: "unknown", detail: SES_UNAVAILABLE_MESSAGE };
  }
  const res = await getSesIdentity(domain, creds);
  if (!res.ok) {
    if (res.status === 404) return { state: "unknown", detail: "Domain is not configured yet." };
    return safeState("getIdentity", domain, res);
  }
  return mapSesIdentityState(res.json);
}

/**
 * Asks SES to re-run its own DNS check, then reports the state SES returns.
 * Never marks a domain verified locally — SES is the source of truth.
 */
export async function recheckSesDomain(
  creds: EmailProviderCredentials | null | undefined,
  rawDomain: string,
): Promise<ProviderDomainState> {
  const domain = sesIdentityName(rawDomain);
  if (!resolveSesCredentials(creds)) {
    return { state: "unknown", detail: SES_UNAVAILABLE_MESSAGE };
  }
  const refreshed = await refreshSesDkim(domain, creds);
  if (!refreshed.ok && refreshed.status >= 500) return safeState("refreshDkim", domain, refreshed);
  return sesDomainState(creds, domain);
}

/** DNS requirements for an existing identity; empty when it does not exist. */
export async function sesDomainDnsRecords(
  creds: EmailProviderCredentials | null | undefined,
  rawDomain: string,
): Promise<ProviderDnsRecord[]> {
  const domain = sesIdentityName(rawDomain);
  if (!resolveSesCredentials(creds)) return [];
  const res = await getSesIdentity(domain, creds);
  if (!res.ok || !res.json) return [];
  return sesProvisionedRecords(domain, res.json, sesRegion(creds));
}
