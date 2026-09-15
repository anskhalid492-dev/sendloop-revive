import { describe, expect, it } from "vitest";
import { splitReplyBody, replyPreview, decodeHtmlEntities } from "../src/lib/email-body";

describe("email body", () => {
  it("decodes entities", () => {
    expect(decodeHtmlEntities("a&nbsp;b &lt;x&gt; &amp; &#39;q&#39; &#x2019;")).toBe("a\u00a0b <x> & 'q' \u2019");
  });
  it("splits apple mail reply", () => {
    const body = "I don't own this business.\n\nSent from my iPhone\n\nOn Sep 15, 2026, at 5:21 AM, Anus <anus@packologypro.store> wrote:\n\nHi Rooster Moon Coffeehouse, ...";
    const p = splitReplyBody(body);
    expect(p.reply).toBe("I don't own this business.");
    expect(p.signature).toBe("Sent from my iPhone");
    expect(p.quoted.startsWith("On Sep 15")).toBe(true);
    expect(replyPreview(body)).toBe("I don't own this business.");
  });
  it("handles inline one-line variant with entities", () => {
    const p = splitReplyBody("I don&#39;t own this business. Sent from my iPhone On Sep 15, 2026, at 5:21 AM, Anus &lt;a@b.co&gt; wrote: Hi there");
    expect(p.reply).toBe("I don't own this business.");
    expect(p.quoted).toContain("<a@b.co>");
  });
  it("handles > quotes and original message", () => {
    expect(splitReplyBody("Sure, works.\n\n> old line").reply).toBe("Sure, works.");
    expect(splitReplyBody("No thanks\n-----Original Message-----\nFrom: x").quoted).toContain("Original Message");
  });
  it("keeps plain replies intact", () => {
    const p = splitReplyBody("Hello there\nsecond line");
    expect(p.reply).toBe("Hello there\nsecond line");
    expect(p.quoted).toBe("");
  });
});
