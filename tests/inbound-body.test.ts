import { describe, expect, it } from "vitest";

import { extractInboundBody, htmlBodyToText } from "@/lib/inbound-body";

const gmailAlternative = [
  "--000000000000f18d77065b9bce20",
  'Content-Type: text/plain; charset="UTF-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Hi yes, Received =E2=80=94 thanks Andr=C3=A9!",
  "",
  "On Wed, Sep 16, 2026 at 9:02=E2=80=AFAM Daria <daria@leadsmunch.com> wrote:",
  "> original message",
  "",
  "--000000000000f18d77065b9bce20",
  'Content-Type: text/html; charset="UTF-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<div dir=3D\"ltr\">Hi yes, Received</div>",
  "",
  "--000000000000f18d77065b9bce20--",
  "",
].join("\r\n");

describe("inbound body extraction", () => {
  it("returns only the decoded text part of a Gmail multipart reply", () => {
    const { text } = extractInboundBody(gmailAlternative);
    expect(text).toContain("Hi yes, Received — thanks André!");
    expect(text).not.toContain("--000000000000f18d77065b9bce20");
    expect(text).not.toMatch(/Content-Type/i);
    expect(text).not.toMatch(/Content-Transfer-Encoding/i);
  });

  it("keeps the quoted history in the text so the collapsing step still works", () => {
    const { text } = extractInboundBody(gmailAlternative);
    expect(text).toContain("wrote:");
    expect(text).toContain("> original message");
  });

  it("uses the declared Content-Type when the fetch provided the headers", () => {
    const body = [
      "--b1",
      "Content-Type: text/plain",
      "Content-Transfer-Encoding: base64",
      "",
      btoa("Sounds good 👍"),
      "--b1--",
      "",
    ].join("\r\n");
    const { text } = extractInboundBody(body, {
      contentType: 'multipart/alternative; boundary="b1"',
    });
    expect(text).toBe("Sounds good 👍");
  });

  it("handles multipart/mixed with an attachment part", () => {
    const raw = [
      "--mixed",
      'Content-Type: multipart/alternative; boundary="alt"',
      "",
      "--alt",
      "Content-Type: text/plain",
      "",
      "Please see the invoice attached.",
      "--alt--",
      "--mixed",
      "Content-Type: application/pdf; name=invoice.pdf",
      'Content-Disposition: attachment; filename="invoice.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      btoa("PDFBYTES"),
      "--mixed--",
      "",
    ].join("\r\n");
    const { text } = extractInboundBody(raw, { contentType: 'multipart/mixed; boundary="mixed"' });
    expect(text).toBe("Please see the invoice attached.");
    expect(text).not.toContain("invoice.pdf");
  });

  it("falls back to the HTML part, stripped of markup, when there is no text part", () => {
    const raw = [
      "--h1",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<div>Hello <b>there</b>&nbsp;=E2=9C=8C</div><p>Second line</p>",
      "--h1--",
      "",
    ].join("\r\n");
    const { text, html } = extractInboundBody(raw, { contentType: 'multipart/mixed; boundary="h1"' });
    expect(html).toContain("<div>");
    expect(text).toContain("Hello there ✌");
    expect(text).toContain("Second line");
    expect(text).not.toContain("<div>");
  });

  it("leaves an ordinary single-part plain body untouched", () => {
    const { text } = extractInboundBody("Thanks, that works for me.\n\nBest,\nSam");
    expect(text).toBe("Thanks, that works for me.\n\nBest,\nSam");
  });

  it("decodes a single-part quoted-printable body", () => {
    const { text } = extractInboundBody("Caf=C3=A9 at 3pm =E2=98=95 works", {
      contentType: "text/plain",
      contentTransferEncoding: "quoted-printable",
    });
    expect(text).toBe("Café at 3pm ☕ works");
  });

  it("returns nothing for an empty body", () => {
    expect(extractInboundBody(null)).toEqual({ text: null, html: null });
  });

  it("strips markup predictably", () => {
    expect(htmlBodyToText("<p>One</p><p>Two</p>")).toBe("One\n\nTwo");
  });
});
