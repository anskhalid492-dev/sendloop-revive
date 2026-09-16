import { describe, expect, it } from "vitest";

import {
  buildClickToken,
  clickRatePercent,
  clickUrl,
  isTrackableDestination,
  parseClickToken,
  rewriteLinksForClickTracking,
} from "@/lib/click-tracking";
import { applyEmailTracking } from "@/lib/email-tracking";

const target = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  messageKind: "campaign" as const,
  messageId: "22222222-2222-2222-2222-222222222222",
  campaignId: "33333333-3333-3333-3333-333333333333",
  leadId: "44444444-4444-4444-4444-444444444444",
  email: "Prospect@Example.com",
};

describe("click tracking tokens", () => {
  it("round-trips the exact message, lead and destination", () => {
    const token = buildClickToken(target, "https://munchreach.com/pricing");
    const parsed = parseClickToken(token);
    expect(parsed).toMatchObject({
      workspaceId: target.workspaceId,
      messageId: target.messageId,
      campaignId: target.campaignId,
      leadId: target.leadId,
      email: "prospect@example.com",
      url: "https://munchreach.com/pricing",
    });
  });

  it("rejects a tampered token", () => {
    const token = buildClickToken(target, "https://munchreach.com/pricing");
    const [payload, signature] = token.split(".");
    expect(parseClickToken(`${payload}.${"0".repeat(signature!.length)}`)).toBeNull();
    expect(parseClickToken("nonsense")).toBeNull();
  });

  it("gives two contacts cryptographically different links", () => {
    const a = clickUrl(target, "https://munchreach.com/pricing");
    const b = clickUrl(
      { ...target, leadId: "55555555-5555-5555-5555-555555555555", messageId: "66666666-6666-6666-6666-666666666666" },
      "https://munchreach.com/pricing",
    );
    expect(a).not.toEqual(b);
    expect(parseClickToken(new URL(a).searchParams.get("t")!)?.leadId).toBe(target.leadId);
  });
});

describe("link rewriting", () => {
  it("wraps real links and leaves unsubscribe, mailto and anchors alone", () => {
    const html = [
      '<a href="https://munchreach.com/pricing">Pricing</a>',
      '<a href="https://munchreach.com/api/public/unsubscribe?t=abc">Unsubscribe</a>',
      '<a href="mailto:hi@munchreach.com">Mail</a>',
      '<a href="#top">Top</a>',
    ].join("");
    const out = rewriteLinksForClickTracking(html, target)!;
    expect(out).toContain("/api/public/click?t=");
    expect(out).toContain('href="https://munchreach.com/api/public/unsubscribe?t=abc"');
    expect(out).toContain('href="mailto:hi@munchreach.com"');
    expect(out).toContain('href="#top"');
  });

  it("never invents HTML for a plain-text email", () => {
    expect(rewriteLinksForClickTracking(null, target)).toBeNull();
    expect(rewriteLinksForClickTracking("", target)).toBeFalsy();
    expect(applyEmailTracking(null, { target, trackOpens: true, trackClicks: true })).toBeNull();
  });

  it("does not treat the pixel or an already-tracked link as a destination", () => {
    expect(isTrackableDestination("https://munchreach.com/api/public/open?t=x")).toBe(false);
    expect(isTrackableDestination("https://munchreach.com/api/public/click?t=x")).toBe(false);
    expect(isTrackableDestination("https://munchreach.com/{{company}}")).toBe(false);
    expect(isTrackableDestination("https://munchreach.com/pricing")).toBe(true);
  });
});

describe("shared tracking step", () => {
  it("respects each switch independently", () => {
    const html = '<a href="https://munchreach.com/pricing">Pricing</a>';
    const both = applyEmailTracking(html, { target, trackOpens: true, trackClicks: true })!;
    expect(both).toContain("/api/public/click?t=");
    expect(both).toContain("/api/public/open?t=");

    const opensOnly = applyEmailTracking(html, { target, trackOpens: true, trackClicks: false })!;
    expect(opensOnly).not.toContain("/api/public/click?t=");
    expect(opensOnly).toContain("/api/public/open?t=");

    const off = applyEmailTracking(html, { target, trackOpens: false, trackClicks: false })!;
    expect(off).toBe(html);
  });

  it("never wraps its own pixel as a click", () => {
    const out = applyEmailTracking('<p>hi</p>', {
      target,
      trackOpens: true,
      trackClicks: true,
    })!;
    expect(out.match(/api\/public\/click/g)).toBeNull();
  });
});

describe("click rate", () => {
  it("is unique clickers over sent", () => {
    expect(clickRatePercent(1, 4)).toBe(25);
    expect(clickRatePercent(0, 0)).toBe(0);
    expect(clickRatePercent(3, 7)).toBe(42.9);
  });
});
