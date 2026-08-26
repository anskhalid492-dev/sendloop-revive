import { describe, expect, it } from "vitest";
import { compareMxRecords, computeDomainReadiness } from "@/lib/email-providers/inbound";

describe("compareMxRecords", () => {
  it("matches host case-insensitively and ignores trailing dots", () => {
    const result = compareMxRecords(
      [{ host: "inbound.example-provider.com", priority: 10 }],
      [{ host: "Inbound.Example-Provider.com.", priority: 10 }],
    );
    expect(result).toBe("correct");
  });

  it("flags a third-party mail host as a conflict", () => {
    const result = compareMxRecords(
      [{ host: "inbound.example-provider.com", priority: 10 }],
      [{ host: "mx1.hostinger.com", priority: 5 }],
    );
    expect(result).toBe("third_party");
  });

  it("reports no_mx when nothing is published", () => {
    expect(compareMxRecords([{ host: "a.b", priority: 10 }], [])).toBe("no_mx");
  });

  it("reports unknown requirements when the provider has no MX yet", () => {
    expect(compareMxRecords([], [{ host: "mx1.hostinger.com", priority: 5 }])).toBe(
      "unknown_requirements",
    );
  });
});

describe("computeDomainReadiness", () => {
  it("is ready only when sending is verified, inbound is on and MX matches", () => {
    expect(
      computeDomainReadiness({
        sending: "verified",
        inboundEnabled: true,
        mx: "correct",
        setupMode: "api",
      }),
    ).toBe("ready");
  });

  it("surfaces a DNS conflict ahead of readiness", () => {
    expect(
      computeDomainReadiness({
        sending: "verified",
        inboundEnabled: true,
        mx: "third_party",
        setupMode: "api",
      }),
    ).toBe("dns_conflict");
  });

  it("marks receiving as unsupported providers plainly", () => {
    expect(
      computeDomainReadiness({
        sending: "verified",
        inboundEnabled: false,
        mx: "unknown_requirements",
        setupMode: "unsupported",
      }),
    ).toBe("receiving_unsupported");
  });
});
