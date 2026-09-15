import { describe, expect, it } from "vitest";

import { domainIsPinnedToProvider } from "@/lib/domain-verification.server";

describe("customer domain provider routing", () => {
  it("pins a verified domain to the provider it was verified on", () => {
    expect(
      domainIsPinnedToProvider({
        provider: "ses",
        stage: "ready",
        verified_at: "2026-01-01T00:00:00Z",
        dns_status: "verified",
      }),
    ).toBe(true);
  });

  it("lets a pending-DNS domain follow the active provider", () => {
    expect(
      domainIsPinnedToProvider({
        provider: "ses",
        stage: "pending_dns",
        verified_at: null,
        dns_status: "pending",
      }),
    ).toBe(false);
  });

  it("treats a brand new domain as unpinned", () => {
    expect(
      domainIsPinnedToProvider({
        provider: null,
        stage: "pending_dns",
        verified_at: null,
        dns_status: null,
      }),
    ).toBe(false);
  });

  it("keeps a domain that failed verification on no provider pin", () => {
    expect(
      domainIsPinnedToProvider({
        provider: "resend",
        stage: "provider_error",
        verified_at: null,
        dns_status: "failed",
      }),
    ).toBe(false);
  });
});
