import { describe, expect, it } from "vitest";

import { mapMailerooState, providerText } from "../src/lib/domain-providers/maileroo.server";

describe("maileroo provider payload coercion", () => {
  it("never throws on non-string status values", () => {
    expect(() => mapMailerooState({ status: 1 })).not.toThrow();
    expect(() => mapMailerooState({ status: { value: "verified" } })).not.toThrow();
    expect(mapMailerooState({ status: { value: "verified" } })).toBe("verified");
    expect(mapMailerooState({ status: "ACTIVE" })).toBe("verified");
    expect(mapMailerooState({ status: 0 })).toBe("pending");
    expect(mapMailerooState({ status: "failed" })).toBe("failed");
  });

  it("treats created spf+dkim as verified regardless of status type", () => {
    expect(
      mapMailerooState({
        status: 2,
        dns_records: { spf_record: { created: true }, dkim_record: { created: true } },
      }),
    ).toBe("verified");
  });

  it("coerces provider text safely", () => {
    expect(providerText(7)).toBe("7");
    expect(providerText(null)).toBe("");
    expect(providerText({ status: "pending" })).toBe("pending");
    expect(providerText("  x  ")).toBe("x");
  });
});
