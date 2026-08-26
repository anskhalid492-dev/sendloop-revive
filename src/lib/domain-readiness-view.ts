/**
 * Client-safe view model for the customer domain readiness experience.
 *
 * Pure: no provider APIs, no DNS calls, no secrets, no provider names. It only
 * translates the provider-neutral readiness result (Phase 5) into the pillars,
 * labels and DNS rows the UI renders. There is no second state system here —
 * `DomainReadinessState` from the readiness engine stays authoritative.
 */
import type { DomainReadinessState, InboundSetupMode, MxState } from "@/lib/email-providers/inbound";

export type PillarState = "ok" | "pending" | "failed" | "unsupported" | "unknown";

export type ReadinessPillar = {
  id: "sending" | "receiving" | "dns" | "webhook";
  label: string;
  state: PillarState;
  detail: string;
};

export type ReadinessDnsRow = {
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  priority: number | null;
  ttl: number;
  purpose: string;
  status: PillarState;
};

/** Provider-neutral readiness payload returned to the browser. */
export type CustomerDomainReadiness = {
  domain: string;
  /** Never a vendor name — customers do not choose or see providers. */
  providerLabel: string;
  state: DomainReadinessState;
  message: string;
  sending: { ready: boolean; detail: string };
  receiving: {
    ready: boolean;
    supported: boolean;
    setupMode: InboundSetupMode;
    canAutoEnable: boolean;
    requiresCustomerAction: boolean;
    detail: string;
  };
  dns: {
    state: MxState;
    currentMx: Array<{ host: string; priority: number | null }>;
    requiredMx: Array<{ host: string; priority: number | null }>;
    records: ReadinessDnsRow[];
  };
  webhook: { connected: boolean; detail: string };
  checkedAt: string;
};

export const READINESS_STATE_LABEL: Record<DomainReadinessState, string> = {
  NOT_CONFIGURED: "Not configured",
  DNS_PENDING: "Waiting for DNS",
  DNS_CONFLICT: "DNS conflict",
  PROVIDER_PENDING: "Verifying domain",
  RECEIVING_DISABLED: "Receiving not enabled",
  READY: "Domain ready",
  ERROR: "Needs attention",
};

export const PILLAR_STATE_LABEL: Record<PillarState, string> = {
  ok: "Ready",
  pending: "Pending",
  failed: "Not ready",
  unsupported: "Not supported",
  unknown: "Unknown",
};

export const PILLAR_STATE_STYLE: Record<PillarState, string> = {
  ok: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  unsupported: "border-border bg-muted text-muted-foreground",
  unknown: "border-border bg-muted text-muted-foreground",
};

/** Plain-language explanation of what public DNS currently says about MX. */
export const MX_STATE_LABEL: Record<MxState, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  third_party: "Conflict",
  mixed: "Conflict",
  no_mx: "Pending propagation",
  unresolved: "Unknown",
  unknown_requirements: "Pending",
};

export function mxPillarState(state: MxState): PillarState {
  switch (state) {
    case "correct":
      return "ok";
    case "no_mx":
    case "unknown_requirements":
      return "pending";
    case "unresolved":
      return "unknown";
    default:
      return "failed";
  }
}

/**
 * Customer-facing reason for a receiving problem. Distinguishes "we can turn
 * this on for you" from "your DNS sends replies elsewhere" from "this cannot
 * receive at all", without naming any provider.
 */
export function receivingReason(readiness: CustomerDomainReadiness): string {
  const { receiving, dns } = readiness;
  if (!receiving.supported) return "Inbound email receiving is not supported by this provider.";
  if (receiving.ready && dns.state === "correct") return "Replies to this domain arrive in your Unified Inbox.";
  if (dns.state === "third_party" || dns.state === "mixed")
    return "Incoming email for this domain is currently routed to another mail provider.";
  if (!receiving.ready && receiving.requiresCustomerAction)
    return "Receiving must be switched on for this domain before replies can reach MunchReach.";
  if (!receiving.ready) return "Receiving is not enabled for this domain yet.";
  if (dns.state === "no_mx") return "The required mail record is not published in your DNS yet.";
  if (dns.state === "unresolved") return "We could not read your DNS just now — we will keep checking.";
  return "Your mail records do not match what is required to receive replies.";
}

/** The four pillars the customer sees. Derived only from readiness facts. */
export function buildPillars(readiness: CustomerDomainReadiness): ReadinessPillar[] {
  const dnsState = mxPillarState(readiness.dns.state);
  return [
    {
      id: "sending",
      label: "Sending",
      state: readiness.sending.ready
        ? "ok"
        : readiness.state === "ERROR"
          ? "failed"
          : readiness.state === "NOT_CONFIGURED"
            ? "pending"
            : "pending",
      detail: readiness.sending.detail,
    },
    {
      id: "receiving",
      label: "Receiving replies",
      state: !readiness.receiving.supported
        ? "unsupported"
        : readiness.receiving.ready && dnsState === "ok"
          ? "ok"
          : dnsState === "unknown"
            ? "unknown"
            : "failed",
      detail: receivingReason(readiness),
    },
    {
      id: "dns",
      label: "DNS",
      state: dnsState,
      detail: MX_STATE_LABEL[readiness.dns.state],
    },
    {
      id: "webhook",
      label: "Webhooks",
      state: readiness.webhook.connected ? "ok" : "pending",
      detail: readiness.webhook.detail,
    },
  ];
}

/**
 * Overall readiness. Sending-ready is NOT the same as replies-arriving, so the
 * overall badge only reads ready when the readiness engine says READY and every
 * required pillar is ok.
 */
export function overallState(readiness: CustomerDomainReadiness): PillarState {
  if (readiness.state === "READY") {
    const required = buildPillars(readiness).filter((p) => p.id !== "webhook" && p.state !== "unsupported");
    return required.every((p) => p.state === "ok") ? "ok" : "pending";
  }
  if (readiness.state === "ERROR" || readiness.state === "DNS_CONFLICT") return "failed";
  return "pending";
}

/** True when the customer must change DNS at their registrar to fix receiving. */
export function hasDnsConflict(readiness: CustomerDomainReadiness): boolean {
  return readiness.dns.state === "third_party" || readiness.dns.state === "mixed";
}
