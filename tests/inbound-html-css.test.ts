import { describe, expect, it } from "vitest";

import { cleanInboundText, htmlBodyToText } from "@/lib/inbound-body";

const brokenStyleHtml = `<html><head>
<sty
96
le type="text/css">
  body, html {
    font-family: Inter, Averta, Helvetica, Arial !important;
    color: #454745;
  }
  a:hover, a:focus { color: #0d1f00; }
  @media only screen and (max-width: 576px) {
    .logo-img { text-align: center; }
    .hidden-xs { display: none !important; }
  }
</style></head>
<body><div>The name on your account has been updated.</div>
<p>If this wasn't you, contact support.</p></body></html>`;

describe("inbound html with a broken style block", () => {
  it("never shows CSS as the message text", () => {
    const text = cleanInboundText(brokenStyleHtml) ?? "";
    expect(text).not.toContain("font-family");
    expect(text).not.toContain("!important");
    expect(text).not.toContain("@media");
    expect(text).toContain("The name on your account has been updated.");
    expect(text).toContain("contact support");
  });

  it("drops an unterminated style block", () => {
    const text = htmlBodyToText("<style>body { color: red; }\n.x { color: blue;");
    expect(text).toBe("");
  });

  it("leaves ordinary text alone", () => {
    expect(cleanInboundText("Sounds good, let's talk Tuesday.")).toBe(
      "Sounds good, let's talk Tuesday.",
    );
  });
});
