/** SendGrid domain adapter — internal only, never named to customers. */
import {
  failure,
  providerFetch,
  record,
  relativeHost,
  type DomainProviderAdapter,
  type ProviderCredentials,
} from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

const API = "https://api.sendgrid.com/v3";

type SgRecord = { host?: string; type?: string; data?: string; valid?: boolean };
type SgDomain = {
  id?: number;
  domain?: string;
  valid?: boolean;
  dns?: Record<string, SgRecord>;
};

function headers(creds: ProviderCredentials) {
  return {
    Authorization: `Bearer ${creds["api_key"] ?? ""}`,
    "Content-Type": "application/json",
  };
}

function mapRecords(domain: string, dns: Record<string, SgRecord> | undefined): ProviderDnsRecord[] {
  if (!dns) return [];
  return Object.entries(dns)
    .filter(([, r]) => r?.host && r?.data)
    .map(([key, r]) => {
      const kind = /dkim/i.test(key) ? "dkim" : /mail_server|subdomain_spf|spf/i.test(key) ? "spf" : "verification";
      return record({
        domain,
        kind,
        type: ((r.type ?? "cname").toUpperCase() === "TXT" ? "TXT" : "CNAME") as "TXT" | "CNAME",
        host: relativeHost(r.host as string, domain),
        value: (r.data as string).trim(),
        ttl: 3600,
        required: true,
        purpose:
          kind === "dkim"
            ? "Signs every outgoing email so mailbox providers can verify it."
            : "Authorises MunchReach to send email as your domain.",
      });
    });
}

async function findDomain(creds: ProviderCredentials, domain: string): Promise<SgDomain | null> {
  const res = await providerFetch(
    `${API}/whitelabel/domains?domain=${encodeURIComponent(domain)}&limit=50`,
    { headers: headers(creds) },
  );
  if (!res.ok) return null;
  const list = (res.json as SgDomain[] | null) ?? [];
  return list.find((d) => (d.domain ?? "").toLowerCase() === domain) ?? null;
}

export const sendgridDomainAdapter: DomainProviderAdapter = {
  id: "sendgrid",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await findDomain(creds, domain);
    if (existing) {
      return {
        providerDomainId: existing.id ? String(existing.id) : null,
        records: mapRecords(domain, existing.dns),
        state: existing.valid ? "verified" : "pending",
        detail: "Domain already registered.",
      };
    }
    const res = await providerFetch(`${API}/whitelabel/domains`, {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify({ domain, automatic_security: true }),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    const created = (res.json as SgDomain) ?? {};
    return {
      providerDomainId: created.id ? String(created.id) : null,
      records: mapRecords(domain, created.dns),
      state: created.valid ? "verified" : "pending",
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    const found = await findDomain(creds, domain);
    return mapRecords(domain, found?.dns);
  },

  async authorizeDomain(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found?.id) return { state: "failed", detail: "Domain is not registered with the provider." };
    const res = await providerFetch(`${API}/whitelabel/domains/${found.id}/validate`, {
      method: "POST",
      headers: headers(creds),
    });
    if (!res.ok) return failure(res.status, res.body);
    const json = (res.json as { valid?: boolean; validation_results?: unknown }) ?? {};
    return json.valid
      ? { state: "verified", detail: "Domain authentication validated." }
      : {
          state: "pending",
          detail: `Validation incomplete: ${JSON.stringify(json.validation_results ?? {}).slice(0, 300)}`,
        };
  },

  async getDomainStatus(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found) return { state: "unknown", detail: "Domain is not registered with the provider." };
    return found.valid
      ? { state: "verified", detail: "Domain authentication is valid." }
      : { state: "pending", detail: "Domain registered, authentication not yet valid." };
  },

  async isReadyToSend(creds, domain) {
    return (await this.getDomainStatus(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found?.id) return { state: "unknown", detail: "Nothing to remove." };
    const res = await providerFetch(`${API}/whitelabel/domains/${found.id}`, {
      method: "DELETE",
      headers: headers(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};
