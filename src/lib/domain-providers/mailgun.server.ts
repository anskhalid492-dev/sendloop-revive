/** Mailgun domain adapter — internal only, never named to customers. */
import {
  failure,
  providerFetch,
  record,
  relativeHost,
  type DomainProviderAdapter,
  type ProviderCredentials,
} from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

type MgRecord = {
  record_type?: string;
  name?: string;
  value?: string;
  valid?: string;
  priority?: string;
};
type MgDomain = { name?: string; state?: string };
type MgDomainResponse = {
  domain?: MgDomain;
  sending_dns_records?: MgRecord[];
  receiving_dns_records?: MgRecord[];
  message?: string;
};

function api(creds: ProviderCredentials): string {
  const region = (creds["region"] ?? "us").toLowerCase();
  return region.startsWith("eu") ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
}

function headers(creds: ProviderCredentials) {
  const token = Buffer.from(`api:${creds["api_key"] ?? ""}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

function mapRecords(domain: string, res: MgDomainResponse): ProviderDnsRecord[] {
  const sending = (res.sending_dns_records ?? []).map((r) => {
    const type = (r.record_type ?? "TXT").toUpperCase() as "TXT" | "CNAME" | "MX";
    const value = (r.value ?? "").trim();
    const name = r.name ?? domain;
    const kind = type === "CNAME" ? "tracking" : /_domainkey/i.test(name) ? "dkim" : "spf";
    return record({
      domain,
      kind,
      type,
      host: relativeHost(name, domain),
      value,
      ttl: 3600,
      required: kind !== "tracking",
      purpose:
        kind === "dkim"
          ? "Signs every outgoing email so mailbox providers can verify it."
          : kind === "tracking"
            ? "Custom tracking host for open and click links (recommended)."
            : "Authorises MunchReach to send email as your domain.",
    });
  });
  const receiving = (res.receiving_dns_records ?? []).map((r) =>
    record({
      domain,
      kind: "mx",
      type: "MX",
      host: relativeHost(r.name ?? domain, domain),
      value: (r.value ?? "").trim(),
      ttl: 3600,
      priority: Number(r.priority) || 10,
      required: false,
      purpose: "Only needed when replies to this domain should land in the MunchReach inbox.",
    }),
  );
  return [...sending, ...receiving];
}

function mapState(state: string | undefined): ProviderDomainState["state"] {
  const s = (state ?? "").toLowerCase();
  if (s === "active") return "verified";
  if (s === "disabled") return "failed";
  if (!s) return "unknown";
  return "pending";
}

async function fetchDomain(
  creds: ProviderCredentials,
  domain: string,
): Promise<{ ok: boolean; status: number; body: string; data: MgDomainResponse | null }> {
  const res = await providerFetch(`${api(creds)}/domains/${encodeURIComponent(domain)}`, {
    headers: headers(creds),
  });
  return { ok: res.ok, status: res.status, body: res.body, data: (res.json as MgDomainResponse) ?? null };
}

export const mailgunDomainAdapter: DomainProviderAdapter = {
  id: "mailgun",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await fetchDomain(creds, domain);
    if (existing.ok && existing.data) {
      return {
        providerDomainId: domain,
        records: mapRecords(domain, existing.data),
        state: mapState(existing.data.domain?.state),
        detail: `Domain already registered with state "${existing.data.domain?.state ?? "unknown"}".`,
      };
    }
    const res = await providerFetch(`${api(creds)}/domains`, {
      method: "POST",
      headers: { ...headers(creds), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: domain, dkim_key_size: "2048" }).toString(),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    const created = (res.json as MgDomainResponse) ?? {};
    return {
      providerDomainId: domain,
      records: mapRecords(domain, created),
      state: mapState(created.domain?.state) === "unknown" ? "pending" : mapState(created.domain?.state),
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    const res = await fetchDomain(creds, domain);
    return res.ok && res.data ? mapRecords(domain, res.data) : [];
  },

  async authorizeDomain(creds, domain) {
    const res = await providerFetch(`${api(creds)}/domains/${encodeURIComponent(domain)}/verify`, {
      method: "PUT",
      headers: headers(creds),
    });
    if (!res.ok) return failure(res.status, res.body);
    const json = (res.json as MgDomainResponse) ?? {};
    return {
      state: mapState(json.domain?.state) === "unknown" ? "pending" : mapState(json.domain?.state),
      detail: json.message ?? `Provider state "${json.domain?.state ?? "pending"}".`,
    };
  },

  async getDomainStatus(creds, domain) {
    const res = await fetchDomain(creds, domain);
    if (!res.ok) return failure(res.status, res.body);
    return {
      state: mapState(res.data?.domain?.state),
      detail: `Provider state "${res.data?.domain?.state ?? "unknown"}".`,
    };
  },

  async isReadyToSend(creds, domain) {
    return (await this.getDomainStatus(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain) {
    const res = await providerFetch(`${api(creds)}/domains/${encodeURIComponent(domain)}`, {
      method: "DELETE",
      headers: headers(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};
