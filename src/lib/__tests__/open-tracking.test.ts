import { describe, expect, it } from "vitest";

import {
  buildOpenToken,
  classifyOpenRequest,
  injectOpenPixel,
  openPixelUrl,
  openRatePercent,
  parseOpenToken,
  transparentGifBytes,
} from "@/lib/open-tracking";

const target = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  messageKind: "campaign" as const,
  messageId: "22222222-2222-2222-2222-222222222222",
  campaignId: "33333333-3333-3333-3333-333333333333",
  leadId: "44444444-4444-4444-4444-444444444444",
  email: "Reader@Example.com",
};

describe("open tracking tokens", () => {
  it("round-trips the message target", () => {
    const parsed = parseOpenToken(buildOpenToken(target));
    expect(parsed).toMatchObject({
      workspaceId: target.workspaceId,
      messageKind: "campaign",
      messageId: target.messageId,
      campaignId: target.campaignId,
      leadId: target.leadId,
      email: "reader@example.com",
    });
  });

  it("rejects a tampered token", () => {
    const token = buildOpenToken(target);
    const [payload, sig] = token.split(".");
    expect(parseOpenToken(`${payload}x.${sig}`)).toBeNull();
    expect(parseOpenToken(`${payload}.${sig?.slice(0, -1)}0`)).toBeNull();
    expect(parseOpenToken("")).toBeNull();
    expect(parseOpenToken("nonsense")).toBeNull();
  });

  it("keeps conversation messages distinguishable from campaign messages", () => {
    const parsed = parseOpenToken(
      buildOpenToken({ ...target, messageKind: "conversation", campaignId: null, leadId: null }),
    );
    expect(parsed?.messageKind).toBe("conversation");
    expect(parsed?.campaignId).toBeNull();
  });
});

describe("pixel injection", () => {
  const url = openPixelUrl(target);

  it("builds an absolute url with the token", () => {
    expect(url).toMatch(/^https?:\/\/.+\/api\/public\/open\?t=/);
  });

  it("injects before </body> when the html is a full document", () => {
    const html = injectOpenPixel("<html><body><p>Hi</p></body></html>", url);
    expect(html).toContain(url);
    expect(html?.indexOf(url)).toBeLessThan(html?.indexOf("</body>") ?? 0);
  });

  it("appends when there is no body tag", () => {
    expect(injectOpenPixel("<p>Hi</p>", url)?.startsWith("<p>Hi</p><img")).toBe(true);
  });

  it("never turns a plain-text email into html", () => {
    expect(injectOpenPixel(null, url)).toBeNull();
    expect(injectOpenPixel("", url)).toBeFalsy();
  });

  it("does not inject twice", () => {
    const once = injectOpenPixel("<p>Hi</p>", url)!;
    expect(injectOpenPixel(once, url)).toBe(once);
  });

  it("leaves html untouched when there is no url", () => {
    expect(injectOpenPixel("<p>Hi</p>", "")).toBe("<p>Hi</p>");
  });
});

describe("prefetch classification", () => {
  it("flags Apple's proxy address range", () => {
    expect(classifyOpenRequest({ ip: "17.58.63.10" })).toEqual({
      isPrefetch: true,
      source: "apple_privacy_proxy",
    });
  });

  it("does not treat Gmail's image proxy as a prefetch", () => {
    const result = classifyOpenRequest({
      userAgent: "Mozilla/5.0 (via ggpht.com GoogleImageProxy)",
      ip: "66.249.84.1",
    });
    expect(result.isPrefetch).toBe(false);
    expect(result.source).toBe("google_image_proxy");
  });

  it("treats an ordinary reader as a real open", () => {
    expect(classifyOpenRequest({ userAgent: "Mozilla/5.0 (iPhone)", ip: "84.23.9.4" })).toEqual({
      isPrefetch: false,
      source: null,
    });
  });
});

describe("open rate", () => {
  it("uses unique opens, so repeat opens cannot inflate it", () => {
    expect(openRatePercent(1, 4)).toBe(25);
    expect(openRatePercent(0, 10)).toBe(0);
    expect(openRatePercent(5, 0)).toBe(0);
  });
});

describe("pixel image", () => {
  it("is a real tiny gif", () => {
    const bytes = transparentGifBytes();
    expect(bytes.byteLength).toBeGreaterThan(20);
    expect(Buffer.from(bytes.slice(0, 3)).toString()).toBe("GIF");
  });
});
