/** Brevo domain adapter — internal only, never named to customers. */
import {
  failure,
  providerFetch,
  record,
  relativeHost,
  type DomainProviderAdapter,
  type ProviderCredentials,
} from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

const API = "https://api.brevo.com/v3";

type BrevoRecord = { type?: string; host_name?: string; value?: string; status?: boolean };
type BrevoDnsRecords = {
  dkim_record?: BrevoRecord;
  brevo_code?: BrevoRecord;
  dmarc_record?: BrevoRecord;
};
type BrevoDomain = {
  id?: number;
  domain_name?: string;
  authenticated?: boolean;
  verified?: boolean;
  dns_records?: BrevoDnsRecords;
};

function headers(creds: ProviderCredentials) {
  return { "api-key": creds["api_key"] ?? "", "Content-Type": "application/json", accept: "application/json" };
}

function mapRecords(domain: string, dns: BrevoDnsRecords | undefined): ProviderDnsRecord[] {
  if (!dns) return [];
  const out: ProviderDnsRecord[] = [];
  const push = (
    r: BrevoRecord | undefined,
    kind: "dkim" | "verification" | "dmarc",
    purpose: string,
    required: boolean,
  ) => {
    if (!r?.value) return;
    out.push(
      record({
        domain,
        kind,
        type: ((r.type ?? "TXT").toUpperCase() === "CNAME" ? "CNAME" : "TXT") as "TXT" | "CNAME",
        host: relativeHost(r.host_name ?? domain, domain),
        value: r.value.trim(),
        ttl: 3600,
        required,
        purpose,
      }),
    );
  };
  push(dns.brevo_code, "verification", "Proves you control this domain.", true);
  push(dns.dkim_record, "dkim", "Signs every outgoing email so mailbox providers can verify it.", true);
  push(dns.dmarc_record, "dmarc", "Publishes your alignment policy and reporting address.", false);
  return out;
}

function mapState(d: BrevoDomain | null): ProviderDomainState["state"] {
  if (!d) return "unknown";
  if (d.authenticated) return "verified";
  return "pending";
}

async function findDomain(creds: ProviderCredentials, domain: string): Promise<BrevoDomain | null> {
  const res = await providerFetch(`${API}/senders/domains`, { headers: headers(creds) });
  if (!res.ok) return null;
  const list = (res.json as { domains?: BrevoDomain[] } | null)?.domains ?? [];
  const found = list.find((d) => (d.domain_name ?? "").toLowerCase() === domain) ?? null;
  if (!found) return null;
  const detail = await providerFetch(`${API}/senders/domains/${encodeURIComponent(domain)}`, {
    headers: headers(creds),
  });
  return detail.ok ? { ...found, ...((detail.json as BrevoDomain) ?? {}) } : found;
}

export const brevoDomainAdapter: DomainProviderAdapter = {
  id: "brevo",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await findDomain(creds, domain);
    if (existing) {
      return {
        providerDomainId: existing.id ? String(existing.id) : domain,
        records: mapRecords(domain, existing.dns_records),
        state: mapState(existing),
        detail: "Domain already registered.",
      };
    }
    const res = await providerFetch(`${API}/senders/domains`, {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify({ name: domain }),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    const created = (res.json as BrevoDomain) ?? {};
    return {
      providerDomainId: created.id ? String(created.id) : domain,
      records: mapRecords(domain, created.dns_records),
      state: "pending",
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    const found = await findDomain(creds, domain);
    return mapRecords(domain, found?.dns_records);
  },

  async authorizeDomain(creds, domain) {
    const res = await providerFetch(
      `${API}/senders/domains/${encodeURIComponent(domain)}/authenticate`,
      { method: "PUT", headers: headers(creds) },
    );
    if (!res.ok) return failure(res.status, res.body);
    const json = (res.json as { dns_records?: BrevoDnsRecords } | null) ?? {};
    const records = json.dns_records ?? {};
    const all = [records.brevo_code, records.dkim_record].filter(Boolean) as BrevoRecord[];
    const allOk = all.length > 0 && all.every((r) => r.status === true);
    return {
      state: allOk ? "verified" : "pending",
      detail: allOk ? "Domain authenticated." : "Provider is still validating the published records.",
    };
  },

  async getDomainStatus(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found) return { state: "unknown", detail: "Domain is not registered with the provider." };
    return {
      state: mapState(found),
      detail: found.authenticated ? "Domain authenticated." : "Domain registered, not yet authenticated.",
    };
  },

  async isReadyToSend(creds, domain) {
    return (await this.getDomainStatus(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain) {
    const res = await providerFetch(`${API}/senders/domains/${encodeURIComponent(domain)}`, {
      method: "DELETE",
      headers: headers(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};
