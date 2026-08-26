/**
 * Provider-neutral labelling of DNS records BY PURPOSE.
 *
 * The generic DNS UI must never guess: DKIM, return path / bounce, tracking,
 * inbound MX, DMARC and SPF are different records with different jobs, and a
 * bounce/feedback MX record is NOT an SPF record. This module derives the label
 * from what the record actually is (type + host + value), so any provider's
 * records display correctly without provider-specific rules in the UI.
 *
 * Pure and client-safe: no DNS lookups, no provider APIs, no secrets.
 */

export type DnsPurpose =
  | "dkim"
  | "return_path"
  | "tracking"
  | "inbound_mx"
  | "dmarc"
  | "spf"
  | "verification";

export const DNS_PURPOSE_LABEL: Record<DnsPurpose, string> = {
  dkim: "DKIM",
  return_path: "Return path / bounce",
  tracking: "Tracking",
  inbound_mx: "Inbound MX",
  dmarc: "DMARC",
  spf: "SPF",
  verification: "Domain verification",
};

export type DnsRecordLike = {
  type: "TXT" | "CNAME" | "MX";
  host?: string | null;
  fqdn?: string | null;
  value?: string | null;
  kind?: string | null;
  purpose?: string | null;
};

function lower(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when the record is published at the root of the domain (`@`). */
export function isRootHost(host: string | null | undefined): boolean {
  const value = lower(host).replace(/\.$/, "");
  return value === "" || value === "@";
}

/**
 * Classifies a DNS record by purpose.
 *
 * MX rules (the important ones):
 *  - MX at the ROOT host is inbound receiving -> `inbound_mx`
 *  - MX on any other host (a bounce/feedback subdomain such as `send`) is the
 *    return path -> `return_path`, NEVER `spf`
 */
export function dnsRecordPurpose(record: DnsRecordLike): DnsPurpose {
  const host = lower(record.host);
  const value = lower(record.value);
  const kind = lower(record.kind);
  const purpose = lower(record.purpose);

  if (record.type === "MX") {
    return isRootHost(record.host) ? "inbound_mx" : "return_path";
  }

  if (record.type === "TXT") {
    if (value.startsWith("v=dmarc") || host.startsWith("_dmarc") || kind === "dmarc") return "dmarc";
    if (value.startsWith("v=spf") || kind === "spf") return "spf";
    if (host.includes("_domainkey") || value.includes("v=dkim") || kind === "dkim") return "dkim";
    return "verification";
  }

  // CNAME
  if (host.includes("_domainkey") || kind === "dkim") return "dkim";
  if (
    kind === "tracking" ||
    host.startsWith("track") ||
    host.startsWith("link") ||
    host.startsWith("click") ||
    purpose.includes("tracking")
  ) {
    return "tracking";
  }
  if (
    kind === "return_path" ||
    purpose.includes("return path") ||
    purpose.includes("bounce") ||
    host.startsWith("bounce") ||
    host.startsWith("mail") ||
    host.startsWith("send") ||
    host.startsWith("em")
  ) {
    return "return_path";
  }
  return "verification";
}

export function dnsRecordPurposeLabel(record: DnsRecordLike): string {
  return DNS_PURPOSE_LABEL[dnsRecordPurpose(record)];
}
