import { describe, expect, it } from "vitest";

import {
  EMAIL_SCOPES,
  filterProvidersForScope,
  isEmailScope,
  isProviderEnabledForScope,
  masterEnabled,
  SCOPE_COLUMN,
} from "@/lib/email-provider-scope";

describe("email provider scopes", () => {
  it("keeps customer and system permissions independent", () => {
    const ses = { is_enabled: true, customer_enabled: false, system_enabled: true };
    const resend = { is_enabled: true, customer_enabled: true, system_enabled: false };

    expect(isProviderEnabledForScope(ses, "customer")).toBe(false);
    expect(isProviderEnabledForScope(ses, "system")).toBe(true);
    expect(isProviderEnabledForScope(resend, "customer")).toBe(true);
    expect(isProviderEnabledForScope(resend, "system")).toBe(false);
  });

  it("routes each email type to the only provider allowed for it", () => {
    const pool = [
      { provider: "ses", is_enabled: true, customer_enabled: false, system_enabled: true },
      { provider: "resend", is_enabled: true, customer_enabled: true, system_enabled: false },
    ];
    expect(filterProvidersForScope(pool, "customer").map((p) => p.provider)).toEqual(["resend"]);
    expect(filterProvidersForScope(pool, "system").map((p) => p.provider)).toEqual(["ses"]);
  });

  it("preserves per-scope priority ordering of the remaining providers", () => {
    const pool = [
      { provider: "a", priority: 1, is_enabled: true, customer_enabled: false, system_enabled: true },
      { provider: "b", priority: 2, is_enabled: true, customer_enabled: true, system_enabled: true },
      { provider: "c", priority: 3, is_enabled: true, customer_enabled: true, system_enabled: false },
    ];
    expect(filterProvidersForScope(pool, "customer").map((p) => p.provider)).toEqual(["b", "c"]);
    expect(filterProvidersForScope(pool, "system").map((p) => p.provider)).toEqual(["a", "b"]);
  });

  it("falls back to the legacy switch when scope columns are absent", () => {
    expect(isProviderEnabledForScope({ is_enabled: true }, "customer")).toBe(true);
    expect(isProviderEnabledForScope({ is_enabled: false }, "system")).toBe(false);
  });

  it("applies to any provider generically, including new ones", () => {
    const future = { is_enabled: true, customer_enabled: true, system_enabled: false };
    for (const scope of EMAIL_SCOPES) {
      expect(typeof isProviderEnabledForScope(future, scope)).toBe("boolean");
      expect(SCOPE_COLUMN[scope]).toMatch(/_enabled$/);
    }
  });

  it("derives the legacy master switch from both scopes", () => {
    expect(masterEnabled({ customer_enabled: false, system_enabled: true })).toBe(true);
    expect(masterEnabled({ customer_enabled: false, system_enabled: false })).toBe(false);
  });

  it("validates scope input", () => {
    expect(isEmailScope("system")).toBe(true);
    expect(isEmailScope("marketing")).toBe(false);
  });
});
