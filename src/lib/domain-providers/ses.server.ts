/**
 * Amazon SES domain adapter — internal only, never named to customers.
 *
 * This adapter contains NO SES API code of its own. It is a thin bridge from
 * the generic domain-provider interface to the single SES implementation in
 * `@/lib/email-providers/ses-provisioning.server`, so there is exactly one SES
 * client, one identity lifecycle and one DNS record source in the codebase.
 *
 * Customers never touch AWS: identity creation, DKIM retrieval and verification
 * polling all run server-side with the platform's own credentials.
 */
import type { DomainProviderAdapter } from "./adapter.server";
import type { ProviderDnsRecord, ProviderDomainSetup, ProviderDomainState } from "./types";

export const sesDomainAdapter: DomainProviderAdapter = {
  id: "ses",
  supportsDomainApi: true,

  /** Idempotent: reuses an existing identity instead of creating a second one. */
  async createDomain(creds, domain): Promise<ProviderDomainSetup> {
    const { provisionSesDomain } = await import("@/lib/email-providers/ses-provisioning.server");
    return provisionSesDomain(creds, domain);
  },

  async getDnsRecords(creds, domain): Promise<ProviderDnsRecord[]> {
    const { sesDomainDnsRecords } = await import("@/lib/email-providers/ses-provisioning.server");
    return sesDomainDnsRecords(creds, domain);
  },

  /** Asks SES to re-run its own DNS check; SES stays the source of truth. */
  async authorizeDomain(creds, domain): Promise<ProviderDomainState> {
    const { recheckSesDomain } = await import("@/lib/email-providers/ses-provisioning.server");
    return recheckSesDomain(creds, domain);
  },

  async getDomainStatus(creds, domain): Promise<ProviderDomainState> {
    const { sesDomainState } = await import("@/lib/email-providers/ses-provisioning.server");
    return sesDomainState(creds, domain);
  },

  async isReadyToSend(creds, domain) {
    const { sesDomainState } = await import("@/lib/email-providers/ses-provisioning.server");
    return (await sesDomainState(creds, domain)).state === "verified";
  },

  async removeDomain(creds, domain): Promise<ProviderDomainState> {
    const { sesIdentityName, safeSesMessage } = await import(
      "@/lib/email-providers/ses-provisioning.server"
    );
    const { sesRequest } = await import("@/lib/email-providers/ses-api.server");
    const name = sesIdentityName(domain);
    const res = await sesRequest(creds, "DELETE", `/v2/email/identities/${encodeURIComponent(name)}`);
    return res.ok
      ? { state: "unknown", detail: "Domain configuration removed." }
      : { state: "failed", detail: safeSesMessage(res.status, res.detail) };
  },
};
