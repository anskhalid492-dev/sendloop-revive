/**
 * Nuntly domain adapter — internal only, never named to customers.
 *
 * API: https://api.nuntly.com  (Bearer apk_… key)
 *   POST   /domains            create a sending/receiving domain
 *   GET    /domains            list domains
 *   GET    /domains/{id}       retrieve a domain with its DNS records
 *   PATCH  /domains/{id}       toggle openTracking / clickTracking
 *   DELETE /domains/{id}       remove a domain
 *
 * Nuntly verifies DNS automatically once the records are published; it exposes
 * no "verify now" endpoint, so `authorizeDomain` re-reads the provider verdict
 * instead of pretending to trigger one.
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

const API = "https://api.nuntly.com";

export type NuntlyDnsRecord = {
  name?: string;
  fullname?: string;
  recordType?: string;
  ttl?: number | string;
  group?: string;
  selector?: string | null;
  priority?: number | null;
  value?: string;
  status?: string;
  statusAt?: string | null;
};

export type NuntlyDomain = {
  id?: string;
  name?: string;
  status?: string;
  region?: string;
  sending?: boolean;
  receiving?: boolean;
  sendingStatus?: string;
  receivingStatus?: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  records?: NuntlyDnsRecord[];
};

export function nuntlyHeaders(creds: ProviderCredentials) {
  return {
    Authorization: `Bearer ${creds["api_key"] ?? ""}`,
    "Content-Type": "application/json",
  };
}

/** Nuntly wraps successful payloads in `{ data: … }`. */
function unwrap<T>(json: unknown): T | null {
  if (!json || typeof json !== "object") return null;
  const holder = json as { data?: unknown };
  return ((holder.data ?? json) as T) ?? null;
}

function purposeFor(kind: ProviderDnsRecord["kind"]): string {
  switch (kind) {
    case "dkim":
      return "Signs every outgoing email so mailbox providers can verify it.";
    case "spf":
      return "Authorises MunchReach to send email as your domain.";
    case "dmarc":
      return "Tells mailbox providers what to do with unauthenticated email.";
    case "mx":
      return "Routes inbound replies to MunchReach. Add it to the root of your domain.";
    case "feedback":
      return "Handles bounce and complaint feedback for your sending domain.";
    case "tracking":
      return "Serves open and click tracking links from your own domain.";
    default:
      return "Confirms ownership of your domain with the sending infrastructure.";
  }
}

function kindFor(group: string, type: string): ProviderDnsRecord["kind"] {
  const g = group.toUpperCase();
  if (g.includes("DKIM")) return "dkim";
  if (g.includes("DMARC")) return "dmarc";
  if (g.includes("SPF")) return "spf";
  if (g.includes("MX_RECEIVING")) return "mx";
  if (g.includes("MX")) return "feedback";
  if (g.includes("TRACK")) return "tracking";
  return type === "MX" ? "feedback" : "verification";
}

export function mapNuntlyRecords(domain: string, records: NuntlyDnsRecord[]): ProviderDnsRecord[] {
  return records
    .filter((r) => (r.value ?? "").trim().length > 0)
    .map((r) => {
      const type = (r.recordType ?? "TXT").toUpperCase() as ProviderDnsRecord["type"];
      const kind = kindFor(r.group ?? "", type);
      const host = relativeHost(r.fullname ?? r.name ?? domain, domain);
      return record({
        domain,
        kind,
        type: type === "CNAME" || type === "MX" ? type : "TXT",
        host: kind === "mx" ? "@" : host,
        value: (r.value ?? "").trim(),
        ttl: Number(r.ttl) || 3600,
        priority: typeof r.priority === "number" ? r.priority : undefined,
        required: true,
        purpose: purposeFor(kind),
      });
    });
}

export function mapNuntlyState(status: string | undefined): ProviderDomainState["state"] {
  const s = (status ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s === "verified" || s === "active" || s === "enabled" || s === "success") return "verified";
  if (s === "failed" || s === "failure" || s === "error") return "failed";
  return "pending";
}

export async function findNuntlyDomain(
  creds: ProviderCredentials,
  domain: string,
): Promise<NuntlyDomain | null> {
  const list = await providerFetch(`${API}/domains`, { headers: nuntlyHeaders(creds) });
  if (!list.ok) return null;
  const payload = unwrap<NuntlyDomain[] | { items?: NuntlyDomain[] }>(list.json);
  const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
  const found = items.find((d) => (d.name ?? "").toLowerCase() === domain.toLowerCase());
  if (!found?.id) return found ?? null;
  const detail = await providerFetch(`${API}/domains/${found.id}`, {
    headers: nuntlyHeaders(creds),
  });
  return detail.ok ? (unwrap<NuntlyDomain>(detail.json) ?? found) : found;
}

export const nuntlyDomainAdapter: DomainProviderAdapter = {
  id: "nuntly",
  supportsDomainApi: true,

  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const existing = await findNuntlyDomain(creds, domain);
    if (existing) {
      return {
        providerDomainId: existing.id ?? null,
        records: mapNuntlyRecords(domain, existing.records ?? []),
        state: mapNuntlyState(existing.status),
        detail: `Domain already registered with status "${existing.status ?? "unknown"}".`,
      };
    }
    const res = await providerFetch(`${API}/domains`, {
      method: "POST",
      headers: nuntlyHeaders(creds),
      body: JSON.stringify({ name: domain, sending: true, receiving: true }),
    });
    if (!res.ok) return { providerDomainId: null, records: [], ...failure(res.status, res.body) };
    const created = unwrap<NuntlyDomain>(res.json) ?? {};
    const state = mapNuntlyState(created.status);
    return {
      providerDomainId: created.id ?? null,
      records: mapNuntlyRecords(domain, created.records ?? []),
      state: state === "unknown" ? "pending" : state,
      detail: "Domain registered.",
    };
  },

  async getDnsRecords(creds, domain) {
    const found = await findNuntlyDomain(creds, domain);
    return mapNuntlyRecords(domain, found?.records ?? []);
  },

  async authorizeDomain(creds, domain) {
    // Nuntly documents no verification trigger: it polls DNS itself. Report the
    // provider's own current verdict rather than inventing a request.
    const found = await findNuntlyDomain(creds, domain);
    if (!found) {
      return { state: "failed", detail: "Domain is not registered with the provider." };
    }
    const state = mapNuntlyState(found.status);
    return {
      state: state === "unknown" ? "pending" : state,
      detail: `Provider checks DNS automatically; current status "${found.status ?? "pending"}".`,
    };
  },

  async getDomainStatus(creds, domain) {
    const found = await findNuntlyDomain(creds, domain);
    if (!found) return { state: "unknown", detail: "Domain is not registered with the provider." };
    return {
      state: mapNuntlyState(found.status),
      detail: `Provider status "${found.status ?? "unknown"}" (sending: ${found.sendingStatus ?? "unknown"}).`,
    };
  },

  async isReadyToSend(creds, domain) {
    const found = await findNuntlyDomain(creds, domain);
    if (!found) return false;
    const sending = (found.sendingStatus ?? "").toLowerCase();
    return mapNuntlyState(found.status) === "verified" && sending !== "disabled" && sending !== "paused";
  },

  async removeDomain(creds, domain) {
    const found = await findNuntlyDomain(creds, domain);
    if (!found?.id) return { state: "unknown", detail: "Nothing to remove." };
    const res = await providerFetch(`${API}/domains/${found.id}`, {
      method: "DELETE",
      headers: nuntlyHeaders(creds),
    });
    return res.ok ? { state: "unknown", detail: "Domain removed." } : failure(res.status, res.body);
  },
};

/** Turns provider-side open/click tracking on for a domain. */
export async function setNuntlyTracking(
  creds: ProviderCredentials,
  domain: string,
  enabled: boolean,
): Promise<{ ok: boolean; detail: string }> {
  const found = await findNuntlyDomain(creds, domain);
  if (!found?.id) return { ok: false, detail: "Domain is not registered with the provider." };
  const res = await providerFetch(`${API}/domains/${found.id}`, {
    method: "PATCH",
    headers: nuntlyHeaders(creds),
    body: JSON.stringify({ openTracking: enabled, clickTracking: enabled }),
  });
  return res.ok
    ? { ok: true, detail: `Tracking ${enabled ? "enabled" : "disabled"} at the provider.` }
    : { ok: false, detail: `Provider responded [${res.status}]: ${res.body.slice(0, 200)}` };
}

export const NUNTLY_API = API;
