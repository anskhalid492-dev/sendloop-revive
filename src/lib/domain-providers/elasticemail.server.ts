/**
 * Elastic Email domain adapter — internal only, never named to customers.
 *
 * API v4: https://api.elasticemail.com/v4  (header `X-ElasticEmail-ApiKey`)
 *   GET    /domains                      list domains
 *   POST   /domains                      add a domain
 *   GET    /domains/{domain}             load one domain
 *   PUT    /domains/{domain}/verification  ask the provider to re-check DNS
 *   DELETE /domains/{domain}             remove a domain
 *
 * IMPORTANT: Elastic Email's API returns DNS *verification booleans*
 * (Spf/Dkim/MX/DMARC/IsRewriteDomainValid) and exactly one concrete record —
 * the DKIM record. It publishes no SPF/DMARC/tracking/MX values through the
 * API, so this adapter returns only the DKIM record and nothing is invented.
 */
import {
  failure,
  providerFetch,
  record,
  relativeHost,
  type DomainProviderAdapter,
  type ProviderCredentials,
} from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

const API = "https://api.elasticemail.com/v4";

export type ElasticDkimRecord = {
  Selector?: string;
  PublicKey?: string;
  HostName?: string;
  RecordValue?: string;
  Domain?: string;
};

export type ElasticDomain = {
  Domain?: string;
  DefaultDomain?: boolean;
  Spf?: boolean;
  Dkim?: boolean;
  MX?: boolean;
  DMARC?: boolean;
  IsRewriteDomainValid?: boolean;
  Verify?: boolean;
  Type?: string;
  TrackingStatus?: string;
  CertificateStatus?: string;
  WasEverVerified?: boolean;
  DKIMRecord?: ElasticDkimRecord | null;
  ValidationLog?: string | null;
};

export function elasticHeaders(creds: ProviderCredentials) {
  return {
    "X-ElasticEmail-ApiKey": creds["api_key"] ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function mapElasticRecords(domain: string, found: ElasticDomain | null): ProviderDnsRecord[] {
  const dkim = found?.DKIMRecord;
  const host = (dkim?.HostName ?? "").trim();
  const value = (dkim?.RecordValue ?? "").trim();
  if (!host || !value) return [];
  return [
    record({
      domain,
      kind: "dkim",
      type: "TXT",
      host: relativeHost(host, domain),
      value,
      ttl: 3600,
      required: true,
      purpose: "Signs every outgoing email so mailbox providers can verify it.",
    }),
  ];
}

/** The provider's own verdict: sending needs SPF + DKIM verified. */
export function mapElasticState(found: ElasticDomain | null): ProviderDomainState["state"] {
  if (!found) return "unknown";
  if (found.Verify === true && found.Spf === true && found.Dkim === true) return "verified";
  if (found.ValidationLog && !found.WasEverVerified && found.Spf === false && found.Dkim === false) {
    return "pending";
  }
  return "pending";
}

export async function findElasticDomain(
  creds: ProviderCredentials,
  domain: string,
): Promise<ElasticDomain | null> {
  const res = await providerFetch(`${API}/domains/${encodeURIComponent(domain)}`, {
    headers: elasticHeaders(creds),
  });
  if (res.ok && res.json) return res.json as ElasticDomain;
  const list = await providerFetch(`${API}/domains`, { headers: elasticHeaders(creds) });
  if (!list.ok) return null;
  const items = (list.json as ElasticDomain[] | null) ?? [];
  return items.find((d) => (d.Domain ?? "").toLowerCase() === domain.toLowerCase()) ?? null;
}

export const elasticEmailDomainAdapter: DomainProviderAdapter = {
  id: "elasticemail",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await findElasticDomain(creds, domain);
    if (existing) {
      return {
        providerDomainId: existing.Domain ?? domain,
        records: mapElasticRecords(domain, existing),
        state: mapElasticState(existing),
        detail: `Domain already registered (SPF ${existing.Spf ? "ok" : "pending"}, DKIM ${existing.Dkim ? "ok" : "pending"}).`,
      };
    }
    const res = await providerFetch(`${API}/domains`, {
      method: "POST",
      headers: elasticHeaders(creds),
      body: JSON.stringify({ Domain: domain, SetAsDefault: false }),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    // The create response omits the DKIM record on some plans; read it back.
    const detail = await findElasticDomain(creds, domain);
    return {
      providerDomainId: domain,
      records: mapElasticRecords(domain, detail),
      state: "pending",
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    return mapElasticRecords(domain, await findElasticDomain(creds, domain));
  },

  async authorizeDomain(creds, domain) {
    const res = await providerFetch(`${API}/domains/${encodeURIComponent(domain)}/verification`, {
      method: "PUT",
      headers: elasticHeaders(creds),
      body: JSON.stringify("None"),
    });
    if (!res.ok) return failure(res.status, res.body);
    const after = await findElasticDomain(creds, domain);
    const state = mapElasticState(after);
    return {
      state,
      detail: `Verification run; SPF ${after?.Spf ? "ok" : "pending"}, DKIM ${after?.Dkim ? "ok" : "pending"}, DMARC ${after?.DMARC ? "ok" : "pending"}.`,
    };
  },

  async getDomainStatus(creds, domain) {
    const found = await findElasticDomain(creds, domain);
    if (!found) return { state: "unknown", detail: "Domain is not registered with the provider." };
    return {
      state: mapElasticState(found),
      detail: `SPF ${found.Spf ? "ok" : "pending"}, DKIM ${found.Dkim ? "ok" : "pending"}, tracking ${found.IsRewriteDomainValid ? "ok" : "pending"}.`,
    };
  },

  async isReadyToSend(creds, domain) {
    return (await this.getDomainStatus(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain) {
    const res = await providerFetch(`${API}/domains/${encodeURIComponent(domain)}`, {
      method: "DELETE",
      headers: elasticHeaders(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};

export const ELASTIC_EMAIL_API = API;
