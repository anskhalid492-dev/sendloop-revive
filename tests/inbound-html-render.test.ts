import { describe, expect, it } from "vitest";

import { extractInboundBody } from "@/lib/inbound-body";
import { sanitizeInboundHtml } from "@/lib/inbound-html";

const outlookHtml = [
  '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
  '<html xmlns:o="urn:schemas-microsoft-com:office:office">',
  '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>Re: Boxes</title>',
  "<style>p.MsoNormal{margin:0}</style><!--[if gte mso 9]><xml><o:shapedefaults/></xml><![endif]--></head>",
  '<body><div class="WordSection1"><p class="MsoNormal">How can we order them<o:p></o:p></p>',
  '<p>Regards,<br>Victor</p><a href="https://example.com">Site</a> <img src="https://cdn.example.com/logo.png" alt="Logo">',
  "</div></body></html>",
].join("\r\n");

describe("inbound HTML rendering", () => {
  it("never shows the DOCTYPE, head, title or Outlook scaffolding", () => {
    const out = sanitizeInboundHtml(outlookHtml);
    expect(out).not.toMatch(/DOCTYPE/i);
    expect(out).not.toContain("&lt;!");
    expect(out).not.toContain("Re: Boxes");
    expect(out).not.toContain("MsoNormal{");
    expect(out).not.toContain("o:p");
    expect(out).toContain("How can we order them");
    expect(out).toContain("<br>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
  });

  it("removes scripts, handlers and unsafe links", () => {
    const out = sanitizeInboundHtml(
      '<!doctype html><body><p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://evil"></iframe><img src="data:image/png;base64,AA"></body>',
    );
    expect(out).toContain("Hi");
    expect(out).not.toMatch(/script|onclick|javascript:|iframe|data:/i);
  });

  it("handles malformed / truncated documents", () => {
    const out = sanitizeInboundHtml('<?xml version="1.0"?><!DOCTYPE html><html><body><div>Partial <b>reply');
    expect(out).not.toMatch(/xml|DOCTYPE/i);
    expect(out).toContain("Partial");
  });

  it("returns empty when only scaffolding remains so text is shown instead", () => {
    expect(sanitizeInboundHtml('<!DOCTYPE html><html><head><title>x</title></head><body> </body></html>')).toBe("");
  });

  it("prefers the HTML part of a real multipart/alternative message, with text fallback", () => {
    const raw = [
      "--alt1",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "How can we order them=0A=0ARegards,",
      "--alt1",
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><html><body><p>How c=',
      "an we order them</p></body></html>",
      "--alt1--",
      "",
    ].join("\r\n");
    const parsed = extractInboundBody(raw, { contentType: 'multipart/alternative; boundary="alt1"' });
    expect(parsed.text).toContain("How can we order them");
    expect(parsed.text).not.toMatch(/DOCTYPE|Content-Type/i);
    const html = sanitizeInboundHtml(parsed.html);
    expect(html).toContain("<p>How can we order them</p>");
    expect(html).not.toMatch(/DOCTYPE/i);
  });

  it("derives clean text from an HTML-only base64 message", () => {
    const doc = '<!DOCTYPE html><html><head><title>T</title></head><body><p>Caf\u00e9 works</p></body></html>';
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(doc)));
    const parsed = extractInboundBody(b64, { contentType: "text/html; charset=utf-8", contentTransferEncoding: "base64" });
    expect(parsed.text).toBe("Café works");
    expect(sanitizeInboundHtml(parsed.html)).toBe("<p>Café works</p>");
  });
});
