import { describe, expect, it } from "vitest";
import {
  buildPillars,
  hasDnsConflict,
  mxPillarState,
  overallState,
  receivingReason,
  type CustomerDomainReadiness,
} from "@/lib/domain-readiness-view";

function readiness(patch: Partial<CustomerDomainReadiness> = {}): CustomerDomainReadiness {
  return {
    domain: "customer.com",
    providerLabel: "Managed sending infrastructure",
    state: "READY",
    message: "This domain is ready to send and receive email.",
    sending: { ready: true, detail: "Verified." },
    receiving: {
      ready: true,
      supported: true,
      setupMode: "api",
      canAutoEnable: false,
      requiresCustomerAction: false,
      detail: "Receiving is on.",
    },
    dns: {
      state: "correct",
      currentMx: [{ host: "inbound.provider.example", priority: 10 }],
      requiredMx: [{ host: "inbound.provider.example", priority: 10 }],
      records: [],
    },
    webhook: { connected: true, detail: "Connected." },
    checkedAt: "2026-08-26T00:00:00.000Z",
    ...patch,
  };
}

const pillar = (r: CustomerDomainReadiness, id: string) =>
  buildPillars(r).find((p) => p.id === id)!;

describe("readiness pillars", () => {
  it("1. ready domain shows every pillar ready and overall ready", () => {
    const r = readiness();
    expect(buildPillars(r).every((p) => p.state === "ok")).toBe(true);
    expect(overallState(r)).toBe("ok");
  });

  it("2. DNS conflict is failed, flagged, and explained without naming a provider", () => {
    const r = readiness({
      state: "DNS_CONFLICT",
      dns: {
        state: "third_party",
        currentMx: [{ host: "mx1.hostinger.com", priority: 5 }],
        requiredMx: [{ host: "inbound.provider.example", priority: 10 }],
        records: [],
      },
    });
    expect(hasDnsConflict(r)).toBe(true);
    expect(pillar(r, "dns").state).toBe("failed");
    expect(pillar(r, "receiving").state).toBe("failed");
    expect(overallState(r)).toBe("failed");
    expect(receivingReason(r)).toBe(
      "Incoming email for this domain is currently routed to another mail provider.",
    );
  });

  it("3. incorrect MX is a failure, not a pending state", () => {
    expect(mxPillarState("incorrect")).toBe("failed");
  });

  it("4. no MX is pending propagation", () => {
    const r = readiness({ state: "DNS_PENDING", dns: { ...readiness().dns, state: "no_mx" } });
    expect(pillar(r, "dns").state).toBe("pending");
    expect(overallState(r)).toBe("pending");
  });

  it("5. unresolved DNS reads as unknown, never as ready", () => {
    const r = readiness({ dns: { ...readiness().dns, state: "unresolved" } });
    expect(pillar(r, "dns").state).toBe("unknown");
    expect(overallState(r)).not.toBe("ok");
  });

  it("6. receiving disabled keeps sending ready but receiving not ready", () => {
    const r = readiness({
      state: "RECEIVING_DISABLED",
      receiving: { ...readiness().receiving, ready: false, canAutoEnable: true },
      dns: { ...readiness().dns, state: "unknown_requirements" },
    });
    expect(pillar(r, "sending").state).toBe("ok");
    expect(pillar(r, "receiving").state).toBe("failed");
    expect(overallState(r)).toBe("pending");
  });

  it("7. receiving enabled with correct MX reports replies arriving", () => {
    expect(receivingReason(readiness())).toContain("Unified Inbox");
  });

  it("8. a provider without inbound support says so plainly", () => {
    const r = readiness({
      receiving: {
        ...readiness().receiving,
        ready: false,
        supported: false,
        setupMode: "unsupported",
      },
    });
    expect(pillar(r, "receiving").state).toBe("unsupported");
    expect(receivingReason(r)).toBe("Inbound email receiving is not supported by this provider.");
    // Sending-only provider must not be blocked by inbound.
    expect(overallState(r)).toBe("ok");
  });

  it("9. a provider requiring customer action gets a neutral instruction", () => {
    const r = readiness({
      state: "RECEIVING_DISABLED",
      receiving: {
        ...readiness().receiving,
        ready: false,
        setupMode: "customer_action",
        requiresCustomerAction: true,
        canAutoEnable: false,
      },
      dns: { ...readiness().dns, state: "unknown_requirements" },
    });
    expect(receivingReason(r)).toContain("switched on for this domain");
  });

  it("10. API-mode providers expose auto-enable", () => {
    const r = readiness({
      receiving: { ...readiness().receiving, ready: false, setupMode: "api", canAutoEnable: true },
    });
    expect(r.receiving.canAutoEnable).toBe(true);
  });

  it("11. webhook not connected is action-required, never silent success", () => {
    const r = readiness({ webhook: { connected: false, detail: "Needs attention." } });
    expect(pillar(r, "webhook").state).toBe("pending");
    expect(overallState(r)).toBe("pending");
  });

  it("12. sending-verified alone never reads as overall ready", () => {
    const r = readiness({
      state: "PROVIDER_PENDING",
      sending: { ready: true, detail: "Verified." },
      receiving: { ...readiness().receiving, ready: false },
    });
    expect(overallState(r)).toBe("pending");
  });

  it("13. multi-provider: dns_only providers are ready on correct DNS alone", () => {
    const r = readiness({
      receiving: { ...readiness().receiving, setupMode: "dns_only", ready: true },
    });
    expect(overallState(r)).toBe("ok");
  });
});
