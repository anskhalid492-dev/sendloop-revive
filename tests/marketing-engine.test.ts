import { describe, expect, it } from "vitest";

import {
  DEFAULT_FREQUENCY_LIMITS,
  evaluateSendGate,
  isValidEmail,
} from "@/lib/marketing/frequency";
import { marketingHeaders, renderMarketingEmail } from "@/lib/marketing/render";
import { builtInSegment, builtInSegments, matchesSegment } from "@/lib/marketing/segments";

const baseGate = {
  email: "person@example.com",
  status: "active" as const,
  suppressed: false,
  alreadySent: false,
  frequency: { sentLast24h: 0, sentLast7d: 0, lastSentAt: null },
};

describe("marketing send gate", () => {
  it("allows an active, uncapped subscriber", () => {
    expect(evaluateSendGate(baseGate)).toEqual({ allowed: true });
  });

  it("blocks unsubscribed, complained and suppressed subscribers", () => {
    for (const status of ["unsubscribed", "complained", "bounced"] as const) {
      const result = evaluateSendGate({ ...baseGate, status });
      expect(result.allowed).toBe(false);
    }
    expect(evaluateSendGate({ ...baseGate, suppressed: true })).toMatchObject({
      allowed: false,
      reason: "suppressed",
    });
  });

  it("enforces the daily and weekly frequency caps", () => {
    expect(
      evaluateSendGate({
        ...baseGate,
        frequency: { sentLast24h: DEFAULT_FREQUENCY_LIMITS.maxPerDay, sentLast7d: 1, lastSentAt: null },
      }),
    ).toMatchObject({ allowed: false, reason: "frequency_capped" });

    expect(
      evaluateSendGate({
        ...baseGate,
        frequency: {
          sentLast24h: 0,
          sentLast7d: DEFAULT_FREQUENCY_LIMITS.maxPerWeek,
          lastSentAt: null,
        },
      }),
    ).toMatchObject({ allowed: false, reason: "frequency_capped" });
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(evaluateSendGate({ ...baseGate, email: "nope" })).toMatchObject({
      allowed: false,
      reason: "invalid_email",
    });
  });
});

describe("marketing rendering", () => {
  const rendered = renderMarketingEmail({
    subject: "Hello {{first_name}}",
    body: "Welcome aboard, {{first_name}}.",
    variables: { first_name: "Ana" },
    unsubscribeUrl: "https://munchreach.com/api/public/marketing/unsubscribe?token=abc",
  });

  it("applies variables to subject and body", () => {
    expect(rendered.subject).toBe("Hello Ana");
    expect(rendered.text).toContain("Welcome aboard, Ana.");
  });

  it("always appends an unsubscribe footer", () => {
    expect(rendered.html).toContain("Unsubscribe");
    expect(rendered.text).toContain("Unsubscribe: https://munchreach.com");
  });

  it("escapes injected HTML from variables", () => {
    const unsafe = renderMarketingEmail({
      subject: "Hi",
      body: "{{name}}",
      variables: { name: "<script>alert(1)</script>" },
      unsubscribeUrl: "https://munchreach.com/u",
    });
    expect(unsafe.html).not.toContain("<script>");
  });

  it("emits one-click unsubscribe headers", () => {
    const headers = marketingHeaders("https://munchreach.com/u", "munchreach-marketing");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toBe("<https://munchreach.com/u>");
  });
});

describe("marketing segments", () => {
  it("exposes built-in segments by key", () => {
    const segments = builtInSegments();
    expect(segments.length).toBeGreaterThan(0);
    const first = segments[0]!;
    expect(builtInSegment(String(first.key))).not.toBeNull();
  });

  it("treats an empty rule set as match-all", () => {
    expect(
      matchesSegment({ email: "a@b.com" } as never, { match: "all", rules: [] }),
    ).toBe(true);
  });
});
