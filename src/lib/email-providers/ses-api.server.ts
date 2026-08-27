/**
 * Canonical Amazon SES (SESv2) REST client for the unified provider layer.
 *
 * This is the ONE place inside `src/lib/email-providers/` that knows the SES
 * API shape: SigV4 authentication, region resolution, email identities, DKIM
 * attributes, MAIL FROM attributes and account sending quota.
 *
 * Server-only. Credentials come from server-side environment secrets and are
 * never exposed to the browser.
 */
import { signAwsRequest } from "@/lib/domain-providers/aws-sigv4.server";

export type SesCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  region: string;
};

export const SES_DEFAULT_REGION = "us-east-1";

/** Resolves SES credentials from explicit creds first, then platform secrets. */
export function resolveSesCredentials(
  creds?: Record<string, string> | null,
): SesCredentials | null {
  const accessKeyId = (
    creds?.["access_key_id"] ??
    creds?.["api_key"] ??
    process.env["AWS_SES_ACCESS_KEY_ID"] ??
    ""
  ).trim();
  const secretAccessKey = (
    creds?.["secret_access_key"] ??
    process.env["AWS_SES_SECRET_ACCESS_KEY"] ??
    ""
  ).trim();
  const region = (
    creds?.["region"] ??
    process.env["AWS_SES_REGION"] ??
    SES_DEFAULT_REGION
  ).trim();
  if (!accessKeyId || !secretAccessKey) return null;
  const sessionToken = creds?.["session_token"];
  return { accessKeyId, secretAccessKey, region: region || SES_DEFAULT_REGION, ...(sessionToken ? { sessionToken } : {}) };
}

export type SesResponse<T> = {
  ok: boolean;
  status: number;
  json: T | null;
  /** Admin/log-only detail; never shown to a customer. */
  detail: string;
};

/** Missing-credential responses are modelled, never thrown. */
export function sesCredentialError<T>(): SesResponse<T> {
  return {
    ok: false,
    status: 0,
    json: null,
    detail: "Sending infrastructure credentials are not configured.",
  };
}

export async function sesRequest<T>(
  creds: Record<string, string> | null | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<SesResponse<T>> {
  const resolved = resolveSesCredentials(creds);
  if (!resolved) return sesCredentialError<T>();

  const signed = await signAwsRequest({
    accessKeyId: resolved.accessKeyId,
    secretAccessKey: resolved.secretAccessKey,
    sessionToken: resolved.sessionToken,
    region: resolved.region,
    service: "ses",
    method,
    host: `email.${resolved.region}.amazonaws.com`,
    path,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  try {
    const res = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      ...(signed.body ? { body: signed.body } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: T | null = null;
    try {
      json = text ? (JSON.parse(text) as T) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      json,
      detail: res.ok ? "OK" : `Provider responded [${res.status}]: ${text.slice(0, 400)}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      detail: `Provider request failed: ${(error as Error).message}`,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Provider payload shapes (internal only)
 * ------------------------------------------------------------------ */

export type SesIdentity = {
  IdentityType?: string;
  VerifiedForSendingStatus?: boolean;
  VerificationStatus?: string;
  DkimAttributes?: {
    Status?: string;
    Tokens?: string[];
    SigningEnabled?: boolean;
  };
  MailFromAttributes?: {
    MailFromDomain?: string;
    MailFromDomainStatus?: string;
    BehaviorOnMxFailure?: string;
  };
};

export type SesAccount = {
  SendingEnabled?: boolean;
  ProductionAccessEnabled?: boolean;
  EnforcementStatus?: string;
  SendQuota?: {
    Max24HourSend?: number;
    MaxSendRate?: number;
    SentLast24Hours?: number;
  };
};

const identityPath = (domain: string) =>
  `/v2/email/identities/${encodeURIComponent(domain.toLowerCase())}`;

export async function getSesIdentity(
  domain: string,
  creds?: Record<string, string> | null,
): Promise<SesResponse<SesIdentity>> {
  return sesRequest<SesIdentity>(creds, "GET", identityPath(domain));
}

/** Creates the domain identity with DKIM signing (idempotent at the caller). */
export async function createSesIdentity(
  domain: string,
  creds?: Record<string, string> | null,
): Promise<SesResponse<SesIdentity>> {
  return sesRequest<SesIdentity>(creds, "POST", "/v2/email/identities", {
    EmailIdentity: domain.toLowerCase(),
    DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
  });
}

/** Re-enables DKIM signing, which makes SES re-run its own DNS check. */
export async function refreshSesDkim(
  domain: string,
  creds?: Record<string, string> | null,
): Promise<SesResponse<SesIdentity>> {
  return sesRequest<SesIdentity>(creds, "PUT", `${identityPath(domain)}/dkim`, {
    SigningEnabled: true,
  });
}

/**
 * Configures a custom MAIL FROM domain. Optional: it is never a prerequisite
 * for basic identity verification, and MX failure falls back to the SES
 * default so sending can never break while DNS propagates.
 */
export async function putSesMailFromAttributes(
  domain: string,
  mailFromDomain: string,
  creds?: Record<string, string> | null,
): Promise<SesResponse<SesIdentity>> {
  return sesRequest<SesIdentity>(creds, "PUT", `${identityPath(domain)}/mail-from`, {
    MailFromDomain: mailFromDomain.toLowerCase(),
    BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
  });
}

export async function getSesAccount(
  creds?: Record<string, string> | null,
): Promise<SesResponse<SesAccount>> {
  return sesRequest<SesAccount>(creds, "GET", "/v2/email/account");
}

/** Region actually used for a request — needed to build MAIL FROM records. */
export function sesRegion(creds?: Record<string, string> | null): string {
  return resolveSesCredentials(creds)?.region ?? SES_DEFAULT_REGION;
}
