/**
 * Marketing sending domains (server-only).
 *
 * Marketing mail is sent from DEDICATED domains, never from the customer cold
 * outbound domains — that separation is the whole point of this module: a
 * marketing complaint must never touch cold-outbound reputation.
 *
 * Verification is REAL for every provider that exposes a domain API (Amazon SES
 * and Resend today): the domain is registered at the provider, the provider's
 * own DNS requirements are stored, and the provider's own verification state is
 * what gets written back. Nothing is ever marked verified locally, and no DNS
 * value is invented here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDomainAdapter } from "@/lib/domain-providers/registry.server";
import type { ProviderDnsRecord } from "@/lib/domain-providers/types";

import { loadProviderCredentials } from "./providers.server";

export type MarketingDnsRecord = {
  type: string;
  name: string;
  value: string;
  priority?: number;
  purpose?: string;
  required?: boolean;
  kind?: string;
};

export type MarketingDomainVerification = {
  status: "pending" | "verified" | "failed";
  detail: string;
  records: MarketingDnsRecord[];
};

function toStoredRecords(records: ProviderDnsRecord[]): MarketingDnsRecord[] {
  return records.map((record) => ({
    type: record.type,
    name: record.fqdn,
    value: record.value,
    ...(record.priority === undefined ? {} : { priority: record.priority }),
    purpose: record.purpose,
    required: record.required,
    kind: record.kind,
  }));
}

/** Per-record DNS status columns are derived from the provider's requirements. */
function recordStates(records: MarketingDnsRecord[], verified: boolean) {
  const has = (kind: string) => records.some((record) => record.kind === kind);
  const state = (kind: string) => (verified ? "pass" : has(kind) ? "pending" : "pending");
  return {
    spf_status: state("spf"),
    dkim_status: state("dkim"),
    dmarc_status: state("dmarc"),
  };
}

/**
 * Verifies (and, first time round, provisions) a marketing sending domain.
 *
 * Idempotent: providers reuse an existing domain/identity, so repeated clicks
 * are safe and can never downgrade an already-verified domain by accident.
 */
export async function verifyMarketingSendingDomain(
  id: string,
): Promise<MarketingDomainVerification> {
  const { data: domainRow, error } = await supabaseAdmin
    .from("marketing_sending_domains")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!domainRow) throw new Error("Sending domain not found");

  const domain = String(domainRow.domain);
  const providerId = domainRow.provider_id as string | null;
  const existing = (
    Array.isArray(domainRow.dns_records) ? domainRow.dns_records : []
  ) as MarketingDnsRecord[];

  if (!providerId) {
    return {
      status: "pending",
      detail: "Assign a provider to this domain before verifying it.",
      records: existing,
    };
  }

  const { data: provider } = await supabaseAdmin
    .from("marketing_email_providers")
    .select("provider_type")
    .eq("id", providerId)
    .maybeSingle();
  const providerType = (provider?.provider_type as string) ?? "";

  const adapter = getDomainAdapter(providerType);
  if (!adapter.supportsDomainApi) {
    return {
      status: (domainRow.verification_status as MarketingDomainVerification["status"]) ?? "pending",
      detail:
        "This provider type has no domain API. Add the domain in the provider dashboard and switch this domain to a provider that supports automatic verification.",
      records: existing,
    };
  }

  const creds = await loadProviderCredentials(providerId);
  if (!creds) {
    return {
      status: "pending",
      detail: "Save this provider's connection details before verifying the domain.",
      records: existing,
    };
  }

  // Register (idempotent) then ask the provider to re-check its own DNS.
  const setup = await adapter.createDomain(creds, domain);
  let records = toStoredRecords(setup.records);
  if (records.length === 0) {
    try {
      records = toStoredRecords(await adapter.getDnsRecords(creds, domain));
    } catch {
      records = existing;
    }
  }
  if (records.length === 0) records = existing;

  let state = setup.state;
  let detail = setup.detail;
  if (state !== "verified") {
    const authorized = await adapter.authorizeDomain(creds, domain);
    state = authorized.state;
    detail = authorized.detail || detail;
  }
  if (state === "unknown") {
    const status = await adapter.getDomainStatus(creds, domain);
    state = status.state;
    detail = status.detail || detail;
  }

  const result: MarketingDomainVerification = {
    status: state === "verified" ? "verified" : state === "failed" ? "failed" : "pending",
    detail:
      detail ||
      (state === "verified"
        ? "The provider has verified this domain."
        : "Waiting for DNS to propagate. We will keep checking."),
    records,
  };

  await supabaseAdmin
    .from("marketing_sending_domains")
    .update({
      verification_status: result.status,
      dns_records: result.records as never,
      ...recordStates(result.records, result.status === "verified"),
      last_checked_at: new Date().toISOString(),
      verified_at: result.status === "verified" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return result;
}
