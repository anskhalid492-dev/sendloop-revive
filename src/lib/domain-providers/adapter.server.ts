/**
 * Domain provider adapter interface.
 *
 * Every provider-specific detail (endpoints, payload shapes, record naming,
 * status vocabulary) lives inside an adapter. The MunchReach domain system only
 * ever talks to this interface, so a provider can be swapped without touching
 * the customer-facing domain UI.
 */
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

export type ProviderCredentials = Record<string, string>;

export type DomainProviderAdapter = {
  id: string;
  /** Whether this provider exposes a domain API at all. */
  supportsDomainApi: boolean;
  /** Registers the domain with the provider (idempotent). */
  createDomain(creds: ProviderCredentials, domain: string): Promise<ProviderDomainSetup>;
  /** Current DNS requirements as reported by the provider. */
  getDnsRecords(creds: ProviderCredentials, domain: string): Promise<ProviderDnsRecord[]>;
  /** Asks the provider to (re)run its own authentication check. */
  authorizeDomain(creds: ProviderCredentials, domain: string): Promise<ProviderDomainState>;
  /** Reads the provider-side status without triggering verification. */
  getDomainStatus(creds: ProviderCredentials, domain: string): Promise<ProviderDomainState>;
  /** True only when the provider says the domain may send. */
  isReadyToSend(creds: ProviderCredentials, domain: string): Promise<boolean>;
  /** Removes/deactivates the domain at the provider. */
  removeDomain(creds: ProviderCredentials, domain: string): Promise<ProviderDomainState>;
  /** Sends one message through this provider (delegated to the sending layer). */
  sendEmail?(
    creds: ProviderCredentials,
    message: ProviderOutboundMessage,
  ): Promise<{ ok: boolean; messageId?: string | undefined; message: string }>;
  /** Provider-side delivery status for a previously sent message. */
  getDeliveryStatus?(
    creds: ProviderCredentials,
    messageId: string,
  ): Promise<{ known: boolean; status: string | null; detail: string }>;
};

/** Provider-agnostic outbound message shape. */
export type ProviderOutboundMessage = {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string> | undefined;
};

export function record(
  input: Omit<ProviderDnsRecord, "id" | "fqdn"> & { fqdn?: string; domain: string },
): ProviderDnsRecord {
  const { domain, ...rest } = input;
  const host = rest.host.replace(/\.$/, "");
  const fqdn =
    rest.fqdn ?? (host === "@" || host === "" ? domain : `${host.replace(/\.$/, "")}.${domain}`);
  return {
    ...rest,
    host,
    fqdn: fqdn.toLowerCase(),
    id: `${rest.kind}:${fqdn.toLowerCase()}:${rest.type}`,
  };
}

/** Strips a trailing apex from a provider-returned absolute host. */
export function relativeHost(name: string, domain: string): string {
  const n = name.replace(/\.$/, "").toLowerCase();
  const d = domain.replace(/\.$/, "").toLowerCase();
  if (n === d) return "@";
  return n.endsWith(`.${d}`) ? n.slice(0, -(d.length + 1)) : n;
}

export async function providerFetch(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: string; json: unknown }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, body, json };
}

export function failure(status: number, body: string): ProviderDomainState {
  return { state: "failed", detail: `Provider responded [${status}]: ${body.slice(0, 400)}` };
}

/** Adapter used for providers without a domain API (e.g. custom SMTP relays). */
export function unsupportedDomainAdapter(id: string): DomainProviderAdapter {
  const state: ProviderDomainState = {
    state: "unknown",
    detail: `${id} does not expose a domain API; authorisation is enforced at send time.`,
  };
  return {
    id,
    supportsDomainApi: false,
    async createDomain() {
      return { ...state, providerDomainId: null, records: [] };
    },
    async getDnsRecords() {
      return [];
    },
    async authorizeDomain() {
      return state;
    },
    async getDomainStatus() {
      return state;
    },
    async isReadyToSend() {
      return false;
    },
    async removeDomain() {
      return state;
    },
  };
}
