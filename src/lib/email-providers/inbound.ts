/**
 * Provider-neutral vocabulary for domain onboarding, inbound receiving and MX
 * conflict detection. Client-safe and pure: no provider APIs, no DNS calls, no
 * environment variables, no hardcoded records.
 *
 * MunchReach supports ROOT-DOMAIN receiving (john@customer.com). Nothing here
 * assumes a receiving subdomain; when a provider needs one, that shows up only
 * in the records the provider itself returns.
 */
import type { DomainStage, ProviderDnsRecord } from "@/lib/domain-providers/types";

/* ------------------------------------------------------------------ *
 * Inbound setup mode (a provider capability, not a global assumption)
 * ------------------------------------------------------------------ */

export const INBOUND_SETUP_MODES = ["api", "dns_only", "customer_action", "unsupported"] as const;

/**
 * How receiving gets switched on for a provider:
 *  - `api`             MunchReach can enable/configure receiving over the API.
 *  - `dns_only`        receiving works as soon as the DNS records are correct.
 *  - `customer_action` the customer must act outside MunchReach first.
 *  - `unsupported`     the provider cannot receive mail at all.
 */
export type InboundSetupMode = (typeof INBOUND_SETUP_MODES)[number];

/* ------------------------------------------------------------------ *
 * MX comparison
 * ------------------------------------------------------------------ */

export type MxRecordValue = { priority: number | null; host: string };

export const MX_STATES = [
  "no_mx",
  "correct",
  "incorrect",
  "third_party",
  "mixed",
  "unresolved",
  "unknown_requirements",
] as const;

export type MxState = (typeof MX_STATES)[number];

export type MxComparison = {
  state: MxState;
  /** Live records observed in public DNS. */
  current: MxRecordValue[];
  /** Records the selected provider requires (provider-derived only). */
  required: MxRecordValue[];
  /** Current hosts that match a required host. */
  matched: string[];
  /** Current hosts that are not part of the provider requirement. */
  foreign: string[];
  /** True when a matching host is published with an unexpected priority. */
  priorityMismatch: boolean;
};

function normalizeHost(host: string): string {
  return host.trim().replace(/\.$/, "").toLowerCase();
}

/** Registrable-ish suffix used only to tell "wrong host, right service" apart. */
function serviceSuffix(host: string): string {
  return normalizeHost(host).split(".").slice(-2).join(".");
}

/** Parses one DoH MX answer ("10 mx1.example.com.") into priority + host. */
export function parseMxAnswer(value: string): MxRecordValue {
  const parts = value.trim().replace(/\.$/, "").split(/\s+/);
  if (parts.length >= 2) {
    const priority = Number(parts[0]);
    return {
      priority: Number.isFinite(priority) ? priority : null,
      host: normalizeHost(parts[1] ?? ""),
    };
  }
  return { priority: null, host: normalizeHost(parts[0] ?? "") };
}

/** Turns provider-issued MX records into comparable values. */
export function requiredMxFromRecords(records: ProviderDnsRecord[]): MxRecordValue[] {
  return records
    .filter((r) => r.type === "MX")
    .map((r) => ({
      priority: typeof r.priority === "number" ? r.priority : null,
      host: normalizeHost(r.value.split(/\s+/).pop() ?? r.value),
    }))
    .filter((r) => r.host.length > 0);
}

/**
 * Compares live MX records against the provider requirement. Pure — never
 * invents a record, never guesses `mx.<domain>`, never edits DNS.
 */
export function compareMxRecords(input: {
  current: MxRecordValue[];
  required: MxRecordValue[];
  /** True when public DNS could not be read (transient/not propagated). */
  lookupFailed?: boolean;
}): MxComparison {
  const current = input.current.map((r) => ({ ...r, host: normalizeHost(r.host) }));
  const required = input.required.map((r) => ({ ...r, host: normalizeHost(r.host) }));
  const base: Omit<MxComparison, "state"> = {
    current,
    required,
    matched: [],
    foreign: [],
    priorityMismatch: false,
  };

  if (input.lookupFailed) return { ...base, state: "unresolved" };
  if (required.length === 0) {
    return { ...base, foreign: current.map((r) => r.host), state: "unknown_requirements" };
  }

  const requiredHosts = new Set(required.map((r) => r.host));
  const matched = current.filter((r) => requiredHosts.has(r.host));
  const foreign = current.filter((r) => !requiredHosts.has(r.host));
  const priorityMismatch = matched.some((r) => {
    const want = required.find((x) => x.host === r.host);
    return want?.priority != null && r.priority != null && r.priority !== want.priority;
  });

  const result: Omit<MxComparison, "state"> = {
    current,
    required,
    matched: matched.map((r) => r.host),
    foreign: foreign.map((r) => r.host),
    priorityMismatch,
  };

  if (current.length === 0) return { ...result, state: "no_mx" };
  if (matched.length > 0 && foreign.length === 0) {
    return { ...result, state: priorityMismatch ? "incorrect" : "correct" };
  }
  if (matched.length > 0) return { ...result, state: "mixed" };

  const requiredSuffixes = new Set(required.map((r) => serviceSuffix(r.host)));
  const sameService = foreign.every((r) => requiredSuffixes.has(serviceSuffix(r.host)));
  return { ...result, state: sameService ? "incorrect" : "third_party" };
}

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

export const DOMAIN_READINESS_STATES = [
  "NOT_CONFIGURED",
  "DNS_PENDING",
  "DNS_CONFLICT",
  "PROVIDER_PENDING",
  "RECEIVING_DISABLED",
  "READY",
  "ERROR",
] as const;

export type DomainReadinessState = (typeof DOMAIN_READINESS_STATES)[number];

/** Maps readiness onto the existing customer-facing domain stage vocabulary. */
export const READINESS_TO_STAGE: Record<DomainReadinessState, DomainStage> = {
  NOT_CONFIGURED: "pending_dns",
  DNS_PENDING: "pending_dns",
  DNS_CONFLICT: "dns_error",
  PROVIDER_PENDING: "provider_verification",
  RECEIVING_DISABLED: "provider_verification",
  READY: "ready",
  ERROR: "provider_error",
};

/**
 * Customer-facing copy. Provider-neutral by construction: no provider is named
 * and no provider-specific wording is used.
 */
export const READINESS_MESSAGE: Record<DomainReadinessState, string> = {
  NOT_CONFIGURED: "This domain has not been set up for sending yet.",
  DNS_PENDING: "We are waiting for your DNS records to appear. This can take a little while.",
  DNS_CONFLICT:
    "Your domain currently receives email through another mail provider. To receive campaign replies in MunchReach, your MX records must be configured for the receiving service used by your selected email provider.",
  PROVIDER_PENDING: "Your domain is being verified. We keep checking automatically.",
  RECEIVING_DISABLED:
    "Your email provider requires receiving to be enabled before MunchReach can receive replies.",
  READY: "This domain is ready to send and receive email.",
  ERROR: "This domain could not be verified yet. We will keep checking automatically.",
};

export type ReadinessInput = {
  /** False when the provider has no record of this domain at all. */
  domainKnown: boolean;
  providerState: "unknown" | "pending" | "verified" | "failed";
  readyToSend: boolean;
  inboundSetupMode: InboundSetupMode;
  /** Whether the provider reports receiving as switched on. */
  inboundEnabled: boolean;
  mx: MxComparison;
};

/** Provider-neutral readiness decision. Pure and fully testable. */
export function computeDomainReadiness(input: ReadinessInput): DomainReadinessState {
  if (input.providerState === "failed") return "ERROR";
  if (!input.domainKnown) return "NOT_CONFIGURED";
  if (input.providerState !== "verified" || !input.readyToSend) return "PROVIDER_PENDING";

  // Sending is ready. Inbound decides the rest.
  if (input.inboundSetupMode === "unsupported") return "READY";
  if (!input.inboundEnabled && input.inboundSetupMode !== "dns_only") return "RECEIVING_DISABLED";

  switch (input.mx.state) {
    case "correct":
      return "READY";
    case "no_mx":
    case "unresolved":
    case "unknown_requirements":
      return "DNS_PENDING";
    default:
      return "DNS_CONFLICT";
  }
}
