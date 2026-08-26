/**
 * Provider-neutral DNS requirement hygiene.
 *
 * Providers frequently report the same DNS requirement twice (once on the domain
 * object, once on the inbound/receiving object). This module is the single place
 * that folds those into ONE requirement per DNS fact, so every caller — the
 * readiness engine, the customer UI, admin ops — receives the same list.
 *
 * Pure: no DNS lookups, no provider calls, and it never creates, deletes or
 * modifies a DNS record anywhere.
 */
import type { ProviderDnsRecord } from "@/lib/domain-providers/types";

function normalizeHost(host: string | null | undefined): string {
  const value = (host ?? "").trim().toLowerCase().replace(/\.$/, "");
  return value === "" ? "@" : value;
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
}

/** Identity of a DNS requirement: type + host + target/value + priority. */
export function dnsRequirementKey(record: ProviderDnsRecord): string {
  return [
    record.type.toUpperCase(),
    normalizeHost(record.host),
    normalizeValue(record.fqdn),
    normalizeValue(record.value),
    typeof record.priority === "number" ? String(record.priority) : "",
  ].join("|");
}

/** Removes duplicate DNS requirements, keeping the first occurrence. */
export function dedupeDnsRequirements(records: ProviderDnsRecord[]): ProviderDnsRecord[] {
  const seen = new Set<string>();
  const out: ProviderDnsRecord[] = [];
  for (const record of records) {
    const key = dnsRequirementKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}
