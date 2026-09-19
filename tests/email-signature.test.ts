import { describe, expect, it } from "vitest";

import {
  SENDER_SIGNATURE_TOKEN,
  applySignatureToText,
  bodyUsesSignatureToken,
  clearSignatureToken,
  composeWithSignature,
  injectSignatureHtml,
  renderSignature,
  sanitizeSignatureHtml,
  signatureHtmlSource,
  signatureHtmlToText,
} from "@/lib/signature-model";
import { renderTemplate } from "@/lib/campaign-model";
import { campaignBodyHtml } from "@/lib/email-html";

const FIELDS = {
  first_name: "Anas",
  last_name: "Khalid",
  job_title: "Founder",
  company: "MunchReach",
  email: "anas@munchreach.com",
  phone: "+1 555 010 2030",
  website: "https://munchreach.com",
};

const ROW = {
  html_signature:
    '<div>Best,<br><strong>{{first_name}} {{last_name}}</strong><br>{{job_title}}, {{company}}<br><a href="{{website}}">{{website}}</a></div>',
  plain_text_signature: "",
  enabled: true,
};

describe("signature rendering", () => {
  it("resolves sender variables and never leaves raw tokens", () => {
    const rendered = renderSignature(ROW, FIELDS)!;
    expect(rendered.html).toContain("Anas Khalid");
    expect(rendered.html).not.toContain("{{");
    expect(rendered.text).toContain("Founder, MunchReach");
    expect(rendered.text).toContain("https://munchreach.com");
  });

  it("returns nothing when disabled or empty", () => {
    expect(renderSignature({ ...ROW, enabled: false }, FIELDS)).toBeNull();
    expect(renderSignature({ html_signature: "", plain_text_signature: "", enabled: true }, FIELDS)).toBeNull();
    expect(renderSignature(null, FIELDS)).toBeNull();
  });

  it("strips dangerous markup and unsafe links", () => {
    const html = sanitizeSignatureHtml(
      '<div onclick="steal()">ok<script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="y"></iframe></div>',
    );
    expect(html).not.toMatch(/script|iframe|onclick|javascript:/i);
    expect(html).toContain("ok");
  });

  it("keeps link destinations in the plain-text version", () => {
    expect(signatureHtmlToText('<a href="https://munchreach.com">Website</a>')).toContain(
      "https://munchreach.com",
    );
  });
});

describe("final composition", () => {
  it("appends the signature once to text and html", () => {
    const signature = renderSignature(ROW, FIELDS)!;
    const composed = composeWithSignature({
      body: "Hi John,\n\nQuick question.",
      signature,
      buildHtml: (body) => campaignBodyHtml(body),
    });
    expect(composed.text).toContain("Quick question.");
    expect(composed.text).toContain("Anas Khalid");
    expect(composed.text.match(/Anas Khalid/g)).toHaveLength(1);
    expect(composed.html!.match(/Anas Khalid/g)).toHaveLength(1);
  });

  it("is idempotent when the same message is rebuilt on a retry", () => {
    const signature = renderSignature(ROW, FIELDS)!;
    const once = composeWithSignature({ body: "Hello", signature }).text;
    const twice = applySignatureToText(once, signature.text);
    expect(twice).toEqual(once);
  });

  it("honours explicit placement through the token", () => {
    const body = `Hi,\n\n{{${SENDER_SIGNATURE_TOKEN}}}\n\nUnsubscribe: https://x.test/u`;
    expect(bodyUsesSignatureToken(body)).toBe(true);
    const signature = renderSignature(ROW, FIELDS)!;
    const composed = composeWithSignature({ body, signature, buildHtml: (b) => campaignBodyHtml(b) });
    expect(composed.text.indexOf("Anas Khalid")).toBeLessThan(composed.text.indexOf("Unsubscribe:"));
    expect(composed.text).not.toContain(SENDER_SIGNATURE_TOKEN);
  });

  it("drops the token when the mailbox has no signature", () => {
    const body = `Hi,\n\n{{${SENDER_SIGNATURE_TOKEN}}}`;
    const composed = composeWithSignature({ body, signature: null, buildHtml: (b) => campaignBodyHtml(b) });
    expect(composed.text).not.toContain(SENDER_SIGNATURE_TOKEN);
    expect(composed.text.trim()).toBe("Hi,");
    expect(clearSignatureToken(body)).not.toContain("{{");
    expect(signatureHtmlSource(body)).not.toContain(SENDER_SIGNATURE_TOKEN);
  });

  it("leaves the body untouched when there is no signature at all", () => {
    const composed = composeWithSignature({ body: "Just this.", signature: null, buildHtml: (b) => campaignBodyHtml(b) });
    expect(composed.text).toBe("Just this.");
  });

  it("never injects a second html block when one is already present", () => {
    const signature = renderSignature(ROW, FIELDS)!;
    const first = injectSignatureHtml(campaignBodyHtml(signatureHtmlSource("Hello")), signature.html);
    const second = injectSignatureHtml(first, signature.html);
    expect(second.match(/Anas Khalid/g)).toHaveLength(1);
  });

  it("keeps the signature token alive through template rendering", () => {
    const rendered = renderTemplate(
      `Hi {{first_name}},\n\n{{${SENDER_SIGNATURE_TOKEN}}}`,
      { email: "j@x.test", first_name: "John", custom_fields: {} } as never,
    );
    expect(rendered).toContain("Hi John,");
    expect(rendered).toContain(`{{${SENDER_SIGNATURE_TOKEN}}}`);
  });
});
