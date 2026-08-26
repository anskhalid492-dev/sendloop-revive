import { describe, expect, it } from "vitest";
import {
  compareMxRecords,
  computeDomainReadiness,
  parseMxAnswer,
  requiredMxFromRecords,
  type MxComparison,
} from "@/lib/email-providers/inbound";

const req = [{ host: "inbound.example-provider.com", priority: 10 }];

describe("compareMxRecords", () => {
  it("matches host case-insensitively and ignores trailing dots", () => {
    const result = compareMxRecords({
      current: [{ host: "Inbound.Example-Provider.com.", priority: 10 }],
      required: req,
    });
    expect(result.state).toBe("correct");
    expect(result.matched).toEqual(["inbound.example-provider.com"]);
  });

  it("flags a third-party mail host as a conflict", () => {
    const result = compareMxRecords({
      current: [{ host: "mx1.hostinger.com", priority: 5 }],
      required: req,
    });
    expect(result.state).toBe("third_party");
    expect(result.foreign).toEqual(["mx1.hostinger.com"]);
  });

  it("detects a priority mismatch on the right host", () => {
    const result = compareMxRecords({
      current: [{ host: "inbound.example-provider.com", priority: 20 }],
      required: req,
    });
    expect(result.state).toBe("incorrect");
    expect(result.priorityMismatch).toBe(true);
  });

  it("reports mixed when provider and foreign hosts coexist", () => {
    const result = compareMxRecords({
      current: [
        { host: "inbound.example-provider.com", priority: 10 },
        { host: "mx1.hostinger.com", priority: 5 },
      ],
      required: req,
    });
    expect(result.state).toBe("mixed");
  });

  it("reports no_mx and unresolved and unknown_requirements distinctly", () => {
    expect(compareMxRecords({ current: [], required: req }).state).toBe("no_mx");
    expect(compareMxRecords({ current: [], required: req, lookupFailed: true }).state).toBe(
      "unresolved",
    );
    expect(
      compareMxRecords({ current: [{ host: "mx1.hostinger.com", priority: 5 }], required: [] })
        .state,
    ).toBe("unknown_requirements");
  });
});

describe("provider record parsing", () => {
  it("parses DoH MX answers", () => {
    expect(parseMxAnswer("10 mx1.example.com.")).toEqual({ priority: 10, host: "mx1.example.com" });
  });

  it("only derives MX requirements from provider records, never invents them", () => {
    const derived = requiredMxFromRecords([
      { type: "MX", name: "@", value: "10 inbound.example.com", priority: 10 } as never,
      { type: "TXT", name: "@", value: "v=spf1" } as never,
    ]);
    expect(derived).toEqual([{ priority: 10, host: "inbound.example.com" }]);
    expect(requiredMxFromRecords([])).toEqual([]);
  });
});

function mx(state: MxComparison["state"]): MxComparison {
  return { state, current: [], required: [], matched: [], foreign: [], priorityMismatch: false };
}

describe("computeDomainReadiness", () => {
  const base = {
    domainKnown: true,
    providerState: "verified" as const,
    readyToSend: true,
    inboundSetupMode: "api" as const,
    inboundEnabled: true,
  };

  it("is ready only when sending is verified, inbound is on and MX matches", () => {
    expect(computeDomainReadiness({ ...base, mx: mx("correct") })).toBe("READY");
  });

  it("surfaces a DNS conflict when another provider owns the MX", () => {
    expect(computeDomainReadiness({ ...base, mx: mx("third_party") })).toBe("DNS_CONFLICT");
  });

  it("asks for receiving to be enabled before blaming DNS", () => {
    expect(
      computeDomainReadiness({ ...base, inboundEnabled: false, mx: mx("unknown_requirements") }),
    ).toBe("RECEIVING_DISABLED");
  });

  it("treats dns_only providers as ready once MX is correct", () => {
    expect(
      computeDomainReadiness({
        ...base,
        inboundSetupMode: "dns_only",
        inboundEnabled: false,
        mx: mx("correct"),
      }),
    ).toBe("READY");
  });

  it("does not block sending-only providers on inbound", () => {
    expect(
      computeDomainReadiness({
        ...base,
        inboundSetupMode: "unsupported",
        inboundEnabled: false,
        mx: mx("no_mx"),
      }),
    ).toBe("READY");
  });

  it("reports provider and configuration states", () => {
    expect(computeDomainReadiness({ ...base, domainKnown: false, mx: mx("no_mx") })).toBe(
      "NOT_CONFIGURED",
    );
    expect(
      computeDomainReadiness({ ...base, providerState: "pending", mx: mx("no_mx") }),
    ).toBe("PROVIDER_PENDING");
    expect(computeDomainReadiness({ ...base, providerState: "failed", mx: mx("correct") })).toBe(
      "ERROR",
    );
    expect(computeDomainReadiness({ ...base, mx: mx("no_mx") })).toBe("DNS_PENDING");
  });
});
