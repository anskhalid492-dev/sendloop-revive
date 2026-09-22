import { describe, expect, it } from "vitest";

import {
  composerHtmlHasContent,
  composerHtmlToText,
  safeLinkUrl,
  sanitizeComposerHtml,
  textToComposerHtml,
} from "@/lib/rich-text";
import { richBodyHtml } from "@/lib/email-html";

describe("composer rich text", () => {
  it("keeps bold, italic, underline and links", () => {
    const html = sanitizeComposerHtml(
      '<p>Check our <a href="https://example.com">website</a> — <strong>bold</strong> <em>italic</em> <u>underline</u></p>',
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<u>underline</u>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it("removes scripts and unsafe link schemes", () => {
    const html = sanitizeComposerHtml(
      '<p onclick="steal()">hi<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("treats empty markup as empty", () => {
    expect(sanitizeComposerHtml("<p><br></p>")).toBe("");
    expect(composerHtmlHasContent("<div>&nbsp;</div>")).toBe(false);
    expect(composerHtmlHasContent("<p>hello</p>")).toBe(true);
  });

  it("produces readable plain text that keeps link destinations", () => {
    const text = composerHtmlToText('<p>Check our <a href="https://example.com">website</a></p>');
    expect(text).toContain("website (https://example.com)");
  });

  it("round-trips plain text into paragraphs", () => {
    expect(textToComposerHtml("one\ntwo\n\nthree")).toBe("<p>one<br>two</p><p>three</p>");
    expect(textToComposerHtml("<b>not markup</b>")).toContain("&lt;b&gt;");
  });

  it("validates link addresses", () => {
    expect(safeLinkUrl("example.com")).toBe("https://example.com");
    expect(safeLinkUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeLinkUrl("sam@example.com")).toBe("mailto:sam@example.com");
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("data:text/html,x")).toBeNull();
    expect(safeLinkUrl("")).toBeNull();
  });

  it("sends formatted HTML without re-escaping it", () => {
    const doc = richBodyHtml("<p><strong>Hi</strong></p>");
    expect(doc).toContain("<strong>Hi</strong>");
    expect(doc).not.toContain("&lt;strong&gt;");
    expect(doc.startsWith("<!doctype html>")).toBe(true);
  });
});
