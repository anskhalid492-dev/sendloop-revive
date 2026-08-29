/**
 * Unsubscribe link regression coverage.
 *
 * Guards the full chain: sequence token -> rendered body -> HTML payload.
 */
import { describe, expect, it } from "vitest";

import { renderEmailForLead } from "@/lib/campaign-model";
import { campaignBodyHtml } from "@/lib/email-html";
import {
  applyUnsubscribeUrl,
  buildUnsubscribeToken,
  parseUnsubscribeToken,
  unsubscribeExtras,
  unsubscribeUrl,
} from "@/lib/unsubscribe";

const target = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  campaignId: "22222222-2222-2222-2222-222222222222",
  email: "Lead@Example.com",
  recipientId: "33333333-3333-3333-3333-333333333333",
};

const lead = { email: "lead@example.com", first_name: "Ada", company: "Acme" };

describe("unsubscribe token", () => {
  it("round-trips and is recipient specific", () => {
    const parsed = parseUnsubscribeToken(buildUnsubscribeToken(target));
    expect(parsed).toMatchObject({
      workspaceId: target.workspaceId,
      campaignId: target.campaignId,
      email: "lead@example.com",
      recipientId: target.recipientId,
    });
    const other = buildUnsubscribeToken({ ...target, email: "other@example.com" });
    expect(other).not.toEqual(buildUnsubscribeToken(target));
  });

  it("rejects tampered tokens", () => {
    const token = buildUnsubscribeToken(target);
    const [payload, sig] = token.split(".");
    expect(parseUnsubscribeToken(`${payload}.${"0".repeat(sig!.length)}`)).toBeNull();
    expect(parseUnsubscribeToken("garbage")).toBeNull();
  });

  it("builds an absolute https URL", () => {
    expect(unsubscribeUrl(target)).toMatch(/^https:\/\/[^ ]+\/api\/public\/unsubscribe\?t=/);
  });
});

describe("rendering the sequence token", () => {
  it("resolves {{unsubscribe_link}} to the real URL", () => {
    const url = unsubscribeUrl(target);
    const rendered = renderEmailForLead(
      { subject: "Hi {{first_name}}", body: "Hello {{first_name}}\n\nUnsubscribe: {{unsubscribe_link}}" },
      lead as never,
      { extras: unsubscribeExtras(target) },
    );
    expect(rendered.body).toContain(url);
    expect(rendered.body).not.toContain("{{unsubscribe_link}}");
  });

  it("repairs bodies stored with an empty Unsubscribe footer", () => {
    const url = unsubscribeUrl(target);
    expect(applyUnsubscribeUrl("Hello\n\nUnsubscribe:", url)).toContain(`Unsubscribe: ${url}`);
    expect(applyUnsubscribeUrl("Hello\n\nUnsubscribe", url)).toContain(`Unsubscribe: ${url}`);
    // Already resolved bodies stay untouched.
    const done = `Hello\n\nUnsubscribe: ${url}`;
    expect(applyUnsubscribeUrl(done, url)).toBe(done);
    // Unresolved token variants are all covered.
    expect(applyUnsubscribeUrl("x {{ unsubscribe_url }}", url)).toContain(url);
  });
});

describe("final email HTML", () => {
  const url = unsubscribeUrl(target);
  const body = renderEmailForLead(
    { subject: "s", body: "Hi Ada,\n\nquick question.\n\nUnsubscribe: {{unsubscribe_link}}" },
    lead as never,
    { extras: unsubscribeExtras(target) },
  ).body;
  const html = campaignBodyHtml(body);

  it("contains a clickable anchor, not plain text", () => {
    expect(html).toContain(`<a href="${url}"`);
    expect(html).toContain(">Unsubscribe</a>");
    expect(html).not.toMatch(/Unsubscribe:\s*<\/p>/);
  });

  it("keeps normal links clickable and escapes hostile content", () => {
    const out = campaignBodyHtml("See https://acme.com/pricing for details <script>alert(1)</script>");
    expect(out).toContain('<a href="https://acme.com/pricing"');
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("html-escapes text around the link", () => {
    const out = campaignBodyHtml(`Tom & Jerry\n\nUnsubscribe: ${url}`);
    expect(out).toContain("Tom &amp; Jerry");
    expect(out).toContain(`<a href="${url}"`);
  });
});
