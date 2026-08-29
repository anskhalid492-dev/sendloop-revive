/**
 * Marketing sending domains (server-only).
 *
 * Marketing mail is sent from DEDICATED domains, never from the customer cold
 * outbound domains — that separation is the whole point of this module: a
 * marketing complaint must never touch cold-outbound reputation.
 *
 * SES-backed domains are provisioned and verified through the existing shared
 * SES provisioning helper, so there is exactly one place in the codebase that
 * creates identities. Other provider types record their DNS requirements
 * manually and stay "pending" until an admin marks them verified.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  provisionSesDomain,
  recheckSesDomain,
} from "@/lib/email-providers/ses-provisioning.server";
import type { EmailProviderCredentials } from "@/lib/email-providers/types";

import { loadProviderCredentials } from "./providers.server";

export type MarketingDomainVerification = {
  status: "pending" | "verified" | "failed";
  detail: string;
  records: { type: string; name: string; value: string; priority?: number }[];
};

/**
 * Verifies (and, first time round, provisions) a marketing sending domain.
 *
 * Idempotent: SES reuses an existing identity, so repeated clicks are safe and
 * can never downgrade an already-verified domain by accident.
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

  let providerType: string | null = null;
  if (providerId) {
    const { data: provider } = await supabaseAdmin
      .from("marketing_email_providers")
      .select("provider_type")
      .eq("id", providerId)
      .maybeSingle();
    providerType = (provider?.provider_type as string) ?? null;
  }

  let result: MarketingDomainVerification;

  if (providerType === "ses" && providerId) {
    const creds = (await loadProviderCredentials(providerId)) as
      | EmailProviderCredentials
      | null;
    const existing = Array.isArray(domainRow.dns_records)
      ? (domainRow.dns_records as unknown[])
      : [];
    const setup = existing.length
      ? { records: [], ...(await recheckSesDomain(creds, domain)) }
      : await provisionSesDomain(creds, domain);

    const records =
      "records" in setup && setup.records.length
        ? setup.records
        : (existing as MarketingDomainVerification["records"]);

    result = {
      status:
        setup.state === "verified" ? "verified" : setup.state === "failed" ? "failed" : "pending",
      detail: setup.detail ?? "",
      records: records as MarketingDomainVerification["records"],
    };
  } else {
    // Non-SES providers verify inside their own dashboard; we keep the DNS
    // requirements we were given and never claim a domain is verified for them.
    result = {
      status: (domainRow.verification_status as MarketingDomainVerification["status"]) ?? "pending",
      detail:
        "Add this domain in the provider dashboard, then mark it verified here once the provider confirms DNS.",
      records: (Array.isArray(domainRow.dns_records)
        ? domainRow.dns_records
        : []) as MarketingDomainVerification["records"],
    };
  }

  await supabaseAdmin
    .from("marketing_sending_domains")
    .update({
      verification_status: result.status,
      verification_detail: result.detail,
      dns_records: result.records as never,
      last_checked_at: new Date().toISOString(),
      verified_at: result.status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  return result;
}
