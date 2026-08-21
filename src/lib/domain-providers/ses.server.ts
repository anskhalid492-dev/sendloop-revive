/** Amazon SES domain adapter — internal only, never named to customers. */
import { signAwsRequest } from "./aws-sigv4.server";
import {
  failure,
  record,
  type DomainProviderAdapter,
  type ProviderCredentials,
} from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

type SesIdentity = {
  DkimAttributes?: { Status?: string; Tokens?: string[]; SigningEnabled?: boolean };
  VerifiedForSendingStatus?: boolean;
  VerificationStatus?: string;
  message?: string;
};

function region(creds: ProviderCredentials): string {
  return creds["region"] || process.env["AWS_REGION"] || "us-east-1";
}

async function ses(
  creds: ProviderCredentials,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; body: string; json: SesIdentity | null }> {
  const r = region(creds);
  const signed = await signAwsRequest({
    accessKeyId: creds["access_key_id"] ?? creds["api_key"] ?? "",
    secretAccessKey: creds["secret_access_key"] ?? "",
    sessionToken: creds["session_token"],
    region: r,
    service: "ses",
    method,
    host: `email.${r}.amazonaws.com`,
    path,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    ...(signed.body ? { body: signed.body } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: SesIdentity | null = null;
  try {
    json = text ? (JSON.parse(text) as SesIdentity) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, body: text, json };
}

function dkimRecords(domain: string, tokens: string[]): ProviderDnsRecord[] {
  return tokens.map((token) =>
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

function spfRecord(domain: string): ProviderDnsRecord {
  return record({
    domain,
    kind: "spf",
    type: "TXT",
    host: "@",
    value: "v=spf1 include:amazonses.com ~all",
    ttl: 3600,
    required: true,
    purpose: "Authorises MunchReach to send email as your domain.",
  });
}

function mapState(identity: SesIdentity | null): ProviderDomainState {
  if (!identity) return { state: "unknown", detail: "Identity not found." };
  const dkim = (identity.DkimAttributes?.Status ?? "").toUpperCase();
  if (identity.VerifiedForSendingStatus && dkim === "SUCCESS") {
    return { state: "verified", detail: "Identity verified for sending with DKIM success." };
  }
  if (dkim === "FAILED") return { state: "failed", detail: "DKIM verification failed at the provider." };
  return {
    state: "pending",
    detail: `DKIM status "${dkim || "PENDING"}", sending verified: ${String(identity.VerifiedForSendingStatus ?? false)}.`,
  };
}

async function getIdentity(creds: ProviderCredentials, domain: string) {
  return ses(creds, "GET", `/v2/email/identities/${encodeURIComponent(domain)}`);
}

export const sesDomainAdapter: DomainProviderAdapter = {
  id: "ses",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await getIdentity(creds, domain);
    if (existing.ok && existing.json) {
      const tokens = existing.json.DkimAttributes?.Tokens ?? [];
      return {
        providerDomainId: domain,
        records: [spfRecord(domain), ...dkimRecords(domain, tokens)],
        ...mapState(existing.json),
      };
    }
    const created = await ses(creds, "POST", "/v2/email/identities", {
      EmailIdentity: domain,
      DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
    });
    if (!created.ok) return { providerDomainId: null, records: [], ...failure(created.status, created.body) };
    const tokens = created.json?.DkimAttributes?.Tokens ?? [];
    return {
      providerDomainId: domain,
      records: [spfRecord(domain), ...dkimRecords(domain, tokens)],
      state: "pending",
      detail: "Identity created; DKIM tokens issued.",
    };
  },

  async getDnsRecords(creds, domain) {
    const res = await getIdentity(creds, domain);
    const tokens = res.json?.DkimAttributes?.Tokens ?? [];
    return tokens.length ? [spfRecord(domain), ...dkimRecords(domain, tokens)] : [];
  },

  async authorizeDomain(creds, domain) {
    // SES polls DNS itself; re-enabling DKIM signing triggers a fresh check.
    const res = await ses(creds, "PUT", `/v2/email/identities/${encodeURIComponent(domain)}/dkim`, {
      SigningEnabled: true,
    });
    if (!res.ok && res.status >= 500) return failure(res.status, res.body);
    const status = await getIdentity(creds, domain);
    if (!status.ok) return failure(status.status, status.body);
    return mapState(status.json);
  },

  async getDomainStatus(creds, domain) {
    const res = await getIdentity(creds, domain);
    if (!res.ok) {
      if (res.status === 404) return { state: "unknown", detail: "Identity not found." };
      return failure(res.status, res.body);
    }
    return mapState(res.json);
  },

  async isReadyToSend(creds, domain) {
    return (await this.getDomainStatus(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain) {
    const res = await ses(creds, "DELETE", `/v2/email/identities/${encodeURIComponent(domain)}`);
    return res.ok ? { state: "unknown", detail: "Identity removed." } : failure(res.status, res.body);
  },
};
