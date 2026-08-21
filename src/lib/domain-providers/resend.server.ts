/** Resend domain adapter — internal only, never named to customers. */
import {
  failure,
  providerFetch,
  record,
  relativeHost,
  type DomainProviderAdapter,
  type ProviderCredentials,
} from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

const API = "https://api.resend.com";

type ResendRecord = {
  record?: string;
  name?: string;
  type?: string;
  value?: string;
  ttl?: string | number;
  priority?: number;
};
type ResendDomain = {
  id?: string;
  name?: string;
  status?: string;
  records?: ResendRecord[];
};

function headers(creds: ProviderCredentials) {
  return {
    Authorization: `Bearer ${creds["api_key"] ?? ""}`,
    "Content-Type": "application/json",
  };
}

function mapRecords(domain: string, records: ResendRecord[]): ProviderDnsRecord[] {
  return records.map((r) => {
    const label = (r.record ?? "").toUpperCase();
    const type = (r.type ?? "TXT").toUpperCase() as "TXT" | "CNAME" | "MX";
    const kind = label.includes("DKIM")
      ? "dkim"
      : label.includes("SPF") || type === "MX"
        ? "spf"
        : label.includes("DMARC")
          ? "dmarc"
          : "verification";
    return record({
      domain,
      kind,
      type,
      host: relativeHost(r.name ?? domain, domain),
      value: (r.value ?? "").trim(),
      ttl: Number(r.ttl) || 3600,
      priority: r.priority,
      required: true,
      purpose:
        kind === "dkim"
          ? "Signs every outgoing email so mailbox providers can verify it."
          : "Authorises MunchReach to send email as your domain.",
    });
  });
}

function mapState(status: string | undefined): ProviderDomainState["state"] {
  const s = (status ?? "").toLowerCase();
  if (s === "verified") return "verified";
  if (s === "failed" || s === "temporary_failure") return "failed";
  if (!s) return "unknown";
  return "pending";
}

async function findDomain(
  creds: ProviderCredentials,
  domain: string,
): Promise<ResendDomain | null> {
  const list = await providerFetch(`${API}/domains`, { headers: headers(creds) });
  if (!list.ok) return null;
  const data = (list.json as { data?: ResendDomain[] } | null)?.data ?? [];
  const found = data.find((d) => (d.name ?? "").toLowerCase() === domain);
  if (!found?.id) return found ?? null;
  const detail = await providerFetch(`${API}/domains/${found.id}`, { headers: headers(creds) });
  return detail.ok ? ((detail.json as ResendDomain) ?? found) : found;
}

export const resendDomainAdapter: DomainProviderAdapter = {
  id: "resend",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await findDomain(creds, domain);
    if (existing) {
      return {
        providerDomainId: existing.id ?? null,
        records: mapRecords(domain, existing.records ?? []),
        state: mapState(existing.status),
        detail: `Domain already registered with status "${existing.status ?? "unknown"}".`,
      };
    }
    const res = await providerFetch(`${API}/domains`, {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify({ name: domain }),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    const created = (res.json as ResendDomain) ?? {};
    return {
      providerDomainId: created.id ?? null,
      records: mapRecords(domain, created.records ?? []),
      state: mapState(created.status) === "unknown" ? "pending" : mapState(created.status),
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    const found = await findDomain(creds, domain);
    return mapRecords(domain, found?.records ?? []);
  },

  async authorizeDomain(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found?.id) return { state: "failed", detail: "Domain is not registered with the provider." };
    const res = await providerFetch(`${API}/domains/${found.id}/verify`, {
      method: "POST",
      headers: headers(creds),
    });
    if (!res.ok) return failure(res.status, res.body);
    return { state: "pending", detail: "Verification requested." };
  },

  async getDomainStatus(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found) return { state: "unknown", detail: "Domain is not registered with the provider." };
    return { state: mapState(found.status), detail: `Provider status "${found.status ?? "unknown"}".` };
  },

  async isReadyToSend(creds, domain) {
    return (await this.getDomainStatus(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain) {
    const found = await findDomain(creds, domain);
    if (!found?.id) return { state: "unknown", detail: "Nothing to remove." };
    const res = await providerFetch(`${API}/domains/${found.id}`, {
      method: "DELETE",
      headers: headers(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};
