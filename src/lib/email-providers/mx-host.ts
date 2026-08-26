/**
 * Who owns the inbound MX DNS *host* (name)?  MunchReach does — never the
 * provider, and never another record.
 *
 * MunchReach supports ROOT-DOMAIN receiving (john@customer.com). A provider
 * adapter is only allowed to supply the MX **target/value**, **priority**,
 * **TTL** and **purpose**. The DNS host/name is decided here and is always the
 * root of the customer domain (`@`).
 *
 * Why this exists: providers publish their receiving MX under their own sending
 * label (for example `send.customer.com`). That label usually already carries a
 * CNAME for sending/tracking, and DNS providers correctly reject a CNAME and an
 * MX on the same name:
 *
 *   "RRset send.customer.com IN CNAME must not be used with any other type on
 *    the same name."
 *
 * So the MX host must never be derived from a sending, tracking, DKIM,
 * return-path or any other existing hostname. Pure module: no DNS calls, no
 * provider APIs, no environment variables. MunchReach never writes or deletes
 * customer DNS.
 */
import type { ProviderDnsRecord } from "@/lib/domain-providers/types";

export const INBOUND_RECEIVING_MODES = ["root_domain"] as const;
export type InboundReceivingMode = (typeof INBOUND_RECEIVING_MODES)[number];

/** MunchReach receives on the root domain. */
export const ROOT_DOMAIN_RECEIVING: InboundReceivingMode = "root_domain";

/** Lowercases, trims and strips leading/trailing dots plus any scheme/path. */
export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");
}

/**
 * The DNS host/name for the inbound MX record. For root-domain receiving this
 * is always `@` — regardless of what the provider called its own record.
 */
export function inboundMxHost(mode: InboundReceivingMode = ROOT_DOMAIN_RECEIVING): string {
  return mode === ROOT_DOMAIN_RECEIVING ? "@" : "@";
}

/** The FQDN the inbound MX must be published at: the root domain itself. */
export function inboundMxFqdn(
  domain: string,
  mode: InboundReceivingMode = ROOT_DOMAIN_RECEIVING,
): string {
  const root = normalizeDomain(domain);
  return mode === ROOT_DOMAIN_RECEIVING ? root : root;
}

/** True when this record is the root-domain inbound MX record. */
export function isRootInboundMxRecord(record: ProviderDnsRecord, domain: string): boolean {
  if (record.type !== "MX") return false;
  // A sending/bounce-feedback MX is never the root receiving requirement, even
  // if a provider happens to report it without a hostname.
  if (record.kind === "feedback") return false;
  const root = normalizeDomain(domain);
  const host = (record.host ?? "").trim().toLowerCase();
  const fqdn = normalizeDomain(record.fqdn ?? "");
  return host === "@" || host === "" || fqdn === root;
}

/**
 * Builds the inbound MX record MunchReach shows the customer.
 *
 * The provider supplies `target` (MX value), `priority`, `ttl` and `purpose`.
 * The host/name is forced to `@` here, so a provider-side label such as
 * `send`, `mail`, `smtp` or `inbound` can never leak into DNS instructions and
 * can never collide with an existing CNAME on that label.
 */
export function buildRootInboundMxRecord(input: {
  domain: string;
  /** Provider-supplied MX target/value, e.g. inbound-smtp.us-east-1.amazonaws.com */
  target: string;
  priority?: number | null | undefined;
  ttl?: number | null | undefined;
  purpose?: string | undefined;
  id?: string | undefined;
  mode?: InboundReceivingMode | undefined;
}): ProviderDnsRecord {
  const mode = input.mode ?? ROOT_DOMAIN_RECEIVING;
  const root = normalizeDomain(input.domain);
  // Providers sometimes hand back "10 inbound.example.com." — keep only the host.
  const target = (input.target ?? "").trim().replace(/\.$/, "");
  const parts = target.split(/\s+/);
  const inlinePriority = parts.length > 1 ? Number(parts[0]) : Number.NaN;
  const value = (parts.length > 1 ? parts.slice(1).join(" ") : target).replace(/\.$/, "");

  const priority =
    typeof input.priority === "number" && Number.isFinite(input.priority)
      ? input.priority
      : Number.isFinite(inlinePriority)
        ? inlinePriority
        : 10;

  return {
    id: input.id ?? "inbound-mx",
    kind: "mx",
    type: "MX",
    host: inboundMxHost(mode),
    fqdn: inboundMxFqdn(root, mode),
    value,
    ttl: typeof input.ttl === "number" && input.ttl > 0 ? input.ttl : 3600,
    priority,
    required: true,
    purpose:
      input.purpose ??
      "Routes replies to your campaigns back into MunchReach. Add it to the root of your domain.",
  };
}

/**
 * Customer-facing instruction shown next to the MX record. Provider-neutral and
 * DNS-host neutral: it works the same at Hostinger, Cloudflare, GoDaddy,
 * Porkbun, Namecheap, IONOS, Route 53 or anywhere else.
 */
export const ROOT_MX_INSTRUCTION =
  "Add this MX record to the root of your domain. Do not add it to your sending or tracking subdomain.";

/**
 * DNS forbids a CNAME on the same name as any other record type. If the
 * customer's ROOT name itself carries a CNAME, the root MX cannot be added
 * until that CNAME is removed by the customer — MunchReach only reports this,
 * it never edits DNS.
 *
 * A CNAME on any OTHER hostname (for example `send.customer.com`, used for
 * sending or tracking) is completely valid and must never be reported as a
 * conflict with the root MX.
 */
export function rootMxCompatibility(input: {
  domain: string;
  /** Hostnames observed to carry a CNAME in public DNS. */
  cnameHosts?: string[];
}): { compatible: boolean; reason: string } {
  const root = normalizeDomain(input.domain);
  const conflict = (input.cnameHosts ?? [])
    .map((host) => normalizeDomain(host))
    .some((host) => host === root);
  if (!conflict) {
    return { compatible: true, reason: ROOT_MX_INSTRUCTION };
  }
  return {
    compatible: false,
    reason:
      "Your domain's root name currently has a CNAME record. DNS does not allow a CNAME and an MX record on the same name, so the CNAME on the root must be removed at your DNS provider before the MX record can be added.",
  };
}
