/**
 * Provider-agnostic domain onboarding engine.
 *
 * This is the ONE place that answers "is this customer domain ready to send and
 * receive email?". It never calls a provider API directly: every provider fact
 * comes from `getEmailProvider(providerId)` and the unified EmailProvider
 * interface. Every DNS fact comes from reading the customer's PUBLIC DNS.
 *
 * Root-domain receiving is the product requirement: nothing here derives,
 * suggests or requires a receiving subdomain. If a provider needs one, it shows
 * up only inside the records that provider returns.
 *
 * MunchReach never writes customer DNS.
 */
import { getEmailProvider } from "@/lib/email-providers/registry.server";
import {
  compareMxRecords,
  computeDomainReadiness,
  READINESS_MESSAGE,
  READINESS_TO_STAGE,
  requiredMxFromRecords,
  type DomainReadinessState,
  type InboundSetupMode,
  type MxComparison,
} from "@/lib/email-providers/inbound";
import { isRootInboundMxRecord } from "@/lib/email-providers/mx-host";
import { dedupeDnsRequirements } from "@/lib/email-providers/dns-requirements";
import { TransientDnsError, lookupPublicMx } from "@/lib/dns.server";
import type {
  EmailProviderCredentials,
  ProviderDnsRecord,
  UnifiedDomainStatus,
  UnifiedInboundStatus,
} from "@/lib/email-providers/types";
import type { DomainStage } from "@/lib/domain-providers/types";

export type DomainReadinessReport = {
  domain: string;
  provider: string;
  state: DomainReadinessState;
  /** Existing customer-facing stage vocabulary — no duplicate state system. */
  stage: DomainStage;
  /** Provider-neutral copy safe to show a customer. */
  message: string;
  capabilities: {
    sending: boolean;
    inbound: boolean;
    domain_api: boolean;
    dns_api: boolean;
    inboundSetupMode: InboundSetupMode;
  };
  sending: { state: UnifiedDomainStatus["state"]; readyToSend: boolean; detail: string };
  inbound: { enabled: boolean; detail: string; setupMode: InboundSetupMode };
  /** Provider-derived DNS requirements. Never synthesized locally. */
  records: ProviderDnsRecord[];
  mx: MxComparison;
  /** True when the customer must act outside MunchReach before inbound works. */
  requiresCustomerAction: boolean;
  /** True when MunchReach could enable receiving itself (API mode). */
  canAutoEnableInbound: boolean;
  checkedAt: string;
};

/** Providers can list the same record twice; the comparison needs it once. */
function dedupeMx<T extends { host: string; priority: number | null }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.host}|${record.priority ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Runs a provider read and reports HOW it ended. A thrown lookup error is a
 * failure to check, never evidence about the customer's domain.
 */
async function attempt<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; detail: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Unknown failure" };
  }
}

/**
 * Reads everything through the provider abstraction and the public DNS, then
 * folds it into one provider-neutral readiness report. Read-only: it enables
 * nothing and changes nothing.
 */
export async function evaluateDomainReadiness(options: {
  provider: string;
  domain: string;
  credentials?: EmailProviderCredentials;
}): Promise<DomainReadinessReport> {
  const domain = options.domain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  const provider = getEmailProvider(options.provider);
  const creds = options.credentials ?? {};
  const mode = provider.inboundSetupMode;

  let checkFailed = false;
  let checkDetail = "";

  let status: UnifiedDomainStatus = {
    state: "unknown",
    detail: "This provider has no domain API.",
    readyToSend: false,
  };
  if (provider.getDomainStatus) {
    const read = await attempt(() => provider.getDomainStatus!(creds, domain));
    if (read.ok) {
      status = read.value;
    } else {
      checkFailed = true;
      checkDetail = read.detail;
      status = {
        state: "unknown",
        detail: `The domain status could not be checked just now: ${read.detail}`,
        readyToSend: false,
      };
    }
  }

  let inbound: UnifiedInboundStatus = {
    enabled: false,
    records: [],
    detail: "This provider does not offer inbound receiving.",
  };
  if (provider.getInboundStatus && mode !== "unsupported") {
    const read = await attempt(() => provider.getInboundStatus!(creds, domain));
    if (read.ok) {
      inbound = read.value;
    } else {
      checkFailed = true;
      checkDetail = checkDetail || read.detail;
      inbound = {
        enabled: false,
        records: [],
        detail: `The receiving status could not be checked just now: ${read.detail}`,
      };
    }
  }

  let dnsRecords: ProviderDnsRecord[] = [];
  if (provider.getDnsRequirements) {
    const read = await attempt(() => provider.getDnsRequirements!(creds, domain));
    if (read.ok) dnsRecords = read.value;
    else {
      checkFailed = true;
      checkDetail = checkDetail || read.detail;
    }
  }

  // Provider-derived MX requirement only: sending records and inbound records
  // both come from the provider, never from environment variables.
  //
  // Root-domain receiving is what MunchReach compares: only MX records the
  // provider issues FOR THE ROOT DOMAIN count. Bounce/feedback MX records that
  // a provider puts on its own sending subdomain are published separately and
  // must not be mistaken for the root receiving requirement.
  const rootMxRecords = [...dnsRecords, ...inbound.records].filter((record) =>
    isRootInboundMxRecord(record, domain),
  );
  const required = dedupeMx(requiredMxFromRecords(rootMxRecords));

  let current = [] as Awaited<ReturnType<typeof lookupPublicMx>>;
  let lookupFailed = false;
  try {
    current = await lookupPublicMx(domain);
  } catch (error) {
    lookupFailed = error instanceof TransientDnsError;
  }

  const mx = compareMxRecords({ current, required, lookupFailed });
  const domainKnown = status.state !== "unknown" || dnsRecords.length > 0;
  const state = computeDomainReadiness({
    domainKnown,
    providerState: status.state,
    readyToSend: status.readyToSend,
    inboundSetupMode: mode,
    inboundEnabled: inbound.enabled,
    mx,
    checkFailed,
  });
  if (checkFailed) {
    console.error(
      `[domain-readiness] status check failed for ${domain} on ${provider.id}: ${checkDetail}`,
    );
  }

  return {
    domain,
    provider: provider.id,
    state,
    stage: READINESS_TO_STAGE[state],
    message: READINESS_MESSAGE[state],
    capabilities: {
      sending: provider.capabilities.sending,
      inbound: provider.capabilities.inbound,
      domain_api: provider.capabilities.domain_api,
      dns_api: provider.capabilities.dns_api,
      inboundSetupMode: mode,
    },
    sending: { state: status.state, readyToSend: status.readyToSend, detail: status.detail },
    inbound: { enabled: inbound.enabled, detail: inbound.detail, setupMode: mode },
    // Providers report the same requirement on both the domain object and the
    // inbound object; deduplication happens here so every caller (UI, ops,
    // admin) sees exactly one copy of each DNS fact.
    records: dedupeDnsRequirements([...dnsRecords, ...inbound.records]),
    mx,
    requiresCustomerAction: mode === "customer_action" && !inbound.enabled,
    // Never invite the customer to switch receiving on off the back of a check
    // we could not complete.
    canAutoEnableInbound: mode === "api" && !inbound.enabled && !checkFailed,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Turns receiving on, but only for providers that declare API-mode inbound.
 * Anything else returns the provider-neutral instruction instead of pretending
 * a capability exists.
 */
export async function enableDomainInbound(options: {
  provider: string;
  domain: string;
  credentials?: EmailProviderCredentials;
}): Promise<{ ok: boolean; enabled: boolean; detail: string }> {
  const provider = getEmailProvider(options.provider);
  if (provider.inboundSetupMode === "unsupported" || !provider.capabilities.inbound) {
    return { ok: false, enabled: false, detail: "This email provider cannot receive replies." };
  }
  if (provider.inboundSetupMode === "dns_only") {
    return {
      ok: true,
      enabled: true,
      detail: "Receiving starts working as soon as the required DNS records are live.",
    };
  }
  if (provider.inboundSetupMode === "customer_action" || !provider.enableInbound) {
    return {
      ok: false,
      enabled: false,
      detail:
        "Your email provider requires receiving to be enabled before MunchReach can receive replies.",
    };
  }
  const status = await provider.enableInbound(options.credentials ?? {}, options.domain);
  return { ok: status.enabled, enabled: status.enabled, detail: status.detail };
}
