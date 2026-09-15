/**
 * Maileroo domain adapter — internal only, never named to customers.
 *
 * Account (management) API: https://api.maileroo.com/v1  (Bearer roo_… key)
 *   GET    /domains                       list domains
 *   POST   /domains                       add a domain  {type:"custom", domain_name}
 *   GET    /domains/{id}                  domain detail incl. dns_records
 *   DELETE /domains/{id}                  remove a domain
 *   POST   /domains/{id}/scan-dns         queue a DNS verification scan
 *   GET/PATCH /domains/{id}/settings      interaction / custom-hostname tracking
 *
 * Every DNS value published here comes verbatim from `dns_records`; nothing is
 * synthesised locally.
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

const API = "https://api.maileroo.com/v1";

export type MailerooDnsEntry = {
  host?: string;
  record?: string;
  cname_fallback?: string;
  priority?: number | null;
  created?: boolean;
};

export type MailerooDomain = {
  id?: number | string;
  domain_name?: string;
  status?: string;
  sandbox?: boolean;
  free?: boolean;
  interaction_tracking?: boolean;
  custom_hostname_tracking?: boolean;
  return_path?: string;
  dns_records?: Record<string, MailerooDnsEntry | null>;
};

export function mailerooHeaders(creds: ProviderCredentials) {
  return {
    Authorization: `Bearer ${creds["api_key"] ?? ""}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Maileroo wraps every response in `{ success, message, data }`. */
function data<T>(json: unknown): T | null {
  if (!json || typeof json !== "object") return null;
  return ((json as { data?: unknown }).data as T) ?? null;
}

const RECORD_KINDS: { key: string; kind: ProviderDnsRecord["kind"]; type: ProviderDnsRecord["type"]; purpose: string }[] = [
  {
    key: "dkim_record",
    kind: "dkim",
    type: "TXT",
    purpose: "Signs every outgoing email so mailbox providers can verify it.",
  },
  {
    key: "spf_record",
    kind: "spf",
    type: "TXT",
    purpose: "Authorises MunchReach to send email as your domain.",
  },
  {
    key: "dmarc_record",
    kind: "dmarc",
    type: "TXT",
    purpose: "Tells mailbox providers what to do with unauthenticated email.",
  },
  {
    key: "mx_record",
    kind: "mx",
    type: "MX",
    purpose: "Routes inbound replies to MunchReach.",
  },
  {
    key: "tracking_record",
    kind: "tracking",
    type: "CNAME",
    purpose: "Serves open and click tracking links from your own domain.",
  },
];

/**
 * Provider JSON is untyped at runtime: Maileroo returns `status` as a string on
 * some endpoints and as a number/object on others, and DNS entries occasionally
 * carry non-string values. Everything read out of the payload therefore goes
 * through here — a raw `.toLowerCase()` on a number throws and, before this,
 * that crash was reported upstream as "provider unavailable" and pushed the
 * domain onto whatever other infrastructure could be found.
 */
export function providerText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const nested = value as Record<string, unknown>;
    for (const key of ["value", "status", "name", "label", "state"]) {
      const inner = nested[key];
      if (typeof inner === "string" || typeof inner === "number") return String(inner).trim();
    }
  }
  return "";
}

export function mapMailerooRecords(domain: string, found: MailerooDomain | null): ProviderDnsRecord[] {
  const dns = found?.dns_records ?? {};
  const out: ProviderDnsRecord[] = [];
  for (const spec of RECORD_KINDS) {
    const entry = dns[spec.key];
    const value = providerText(entry?.record);
    const host = providerText(entry?.host);
    if (!value || !host) continue;
    out.push(
      record({
        domain,
        kind: spec.kind,
        type: spec.type,
        host: spec.kind === "mx" ? "@" : relativeHost(host, domain),
        value,
        ttl: 3600,
        ...(typeof entry?.priority === "number" ? { priority: entry.priority } : {}),
        required: spec.kind !== "mx" && spec.kind !== "tracking",
        purpose: spec.purpose,
      }),
    );
  }
  return out;
}

export function mapMailerooState(found: MailerooDomain | null): ProviderDomainState["state"] {
  if (!found) return "unknown";
  const status = (found.status ?? "").toLowerCase();
  if (status.includes("verified") || status.includes("active")) return "verified";
  if (status.includes("fail")) return "failed";
  const dns = found.dns_records ?? {};
  const spf = dns["spf_record"]?.created === true;
  const dkim = dns["dkim_record"]?.created === true;
  if (spf && dkim) return "verified";
  return "pending";
}

export async function findMailerooDomain(
  creds: ProviderCredentials,
  domain: string,
): Promise<MailerooDomain | null> {
  const list = await providerFetch(
    `${API}/domains?search=${encodeURIComponent(domain)}&per_page=100`,
    { headers: mailerooHeaders(creds) },
  );
  if (!list.ok) return null;
  const payload = data<MailerooDomain[] | { domains?: MailerooDomain[] }>(list.json);
  const items = Array.isArray(payload) ? payload : (payload?.domains ?? []);
  const match = items.find(
    (d) => (d.domain_name ?? "").toLowerCase() === domain.toLowerCase(),
  );
  if (!match?.id) return match ?? null;
  const detail = await providerFetch(`${API}/domains/${match.id}`, {
    headers: mailerooHeaders(creds),
  });
  return detail.ok ? (data<MailerooDomain>(detail.json) ?? match) : match;
}

export const mailerooDomainAdapter: DomainProviderAdapter = {
  id: "maileroo",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await findMailerooDomain(creds, domain);
    if (existing) {
      return {
        providerDomainId: existing.id ? String(existing.id) : null,
        records: mapMailerooRecords(domain, existing),
        state: mapMailerooState(existing),
        detail: `Domain already registered with status "${existing.status ?? "unknown"}".`,
      };
    }
    const res = await providerFetch(`${API}/domains`, {
      method: "POST",
      headers: mailerooHeaders(creds),
      body: JSON.stringify({ type: "custom", domain_name: domain }),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    const created = data<MailerooDomain>(res.json) ?? {};
    return {
      providerDomainId: created.id ? String(created.id) : null,
      records: mapMailerooRecords(domain, created),
      state: "pending",
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    return mapMailerooRecords(domain, await findMailerooDomain(creds, domain));
  },

  async authorizeDomain(creds, domain) {
    const found = await findMailerooDomain(creds, domain);
    if (!found?.id) {
      return { state: "failed", detail: "Domain is not registered with the provider." };
    }
    const res = await providerFetch(`${API}/domains/${found.id}/scan-dns`, {
      method: "POST",
      headers: mailerooHeaders(creds),
    });
    if (!res.ok) return failure(res.status, res.body);
    const after = await findMailerooDomain(creds, domain);
    return {
      state: mapMailerooState(after),
      detail: "DNS scan queued at the provider; status updates as records are seen.",
    };
  },

  async getDomainStatus(creds, domain) {
    const found = await findMailerooDomain(creds, domain);
    if (!found) return { state: "unknown", detail: "Domain is not registered with the provider." };
    return {
      state: mapMailerooState(found),
      detail: `Provider status "${found.status ?? "unknown"}".`,
    };
  },

  async isReadyToSend(creds, domain) {
    const found = await findMailerooDomain(creds, domain);
    return Boolean(found) && mapMailerooState(found) === "verified" && found?.sandbox !== true;
  },

  async removeDomain(creds, domain) {
    const found = await findMailerooDomain(creds, domain);
    if (!found?.id) return { state: "unknown", detail: "Nothing to remove." };
    const res = await providerFetch(`${API}/domains/${found.id}`, {
      method: "DELETE",
      headers: mailerooHeaders(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};

/** Toggles provider-side open/click ("interaction") tracking for a domain. */
export async function setMailerooTracking(
  creds: ProviderCredentials,
  domain: string,
  enabled: boolean,
): Promise<{ ok: boolean; detail: string }> {
  const found = await findMailerooDomain(creds, domain);
  if (!found?.id) return { ok: false, detail: "Domain is not registered with the provider." };
  const res = await providerFetch(`${API}/domains/${found.id}/settings`, {
    method: "PATCH",
    headers: mailerooHeaders(creds),
    body: JSON.stringify({ interaction_tracking: enabled }),
  });
  return res.ok
    ? { ok: true, detail: `Tracking ${enabled ? "enabled" : "disabled"} at the provider.` }
    : { ok: false, detail: `Provider responded [${res.status}]: ${res.body.slice(0, 200)}` };
}

export const MAILEROO_ACCOUNT_API = API;
export const MAILEROO_EMAIL_API = "https://smtp.maileroo.com/api/v2";
