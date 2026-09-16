import { describe, expect, it } from "vitest";

import { cleanInboundText } from "@/lib/inbound-body";

const BASE64_BODY = btoa(
  "Dear Packologypro.com team,\n\nThanks for reaching out - happy to take a look.\n\nBest,\nAnna",
);

describe("single decode step for inbound bodies", () => {
  it("decodes a bare base64 body (the shape that leaked into notification emails)", () => {
    const decoded = cleanInboundText(BASE64_BODY);
    expect(decoded).toContain("Dear Packologypro.com team");
    expect(decoded).not.toContain(BASE64_BODY.slice(0, 24));
  });

  it("decodes base64 when the transfer encoding header comes with it", () => {
    const decoded = cleanInboundText(BASE64_BODY, {
      contentType: 'text/plain; charset="UTF-8"',
      contentTransferEncoding: "base64",
    });
    expect(decoded).toContain("happy to take a look");
  });

  it("decodes quoted-printable escapes", () => {
    const decoded = cleanInboundText("Caf=C3=A9 meeting=20confirmed=\nfor Monday");
    expect(decoded).toContain("Café meeting confirmed");
  });

  it("strips multipart scaffolding and returns only the text part", () => {
    const raw = [
      "--000000000000f18d77065b9bce20",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Hi yes, Received=20the file",
      "",
      "--000000000000f18d77065b9bce20--",
    ].join("\r\n");
    const decoded = cleanInboundText(raw);
    expect(decoded).toBe("Hi yes, Received the file");
  });

  it("leaves ordinary reply text untouched", () => {
    const text = "Hi Waqar!\n\nSounds good, let's talk Thursday.";
    expect(cleanInboundText(text)).toBe(text);
  });

  it("does not mistake a normal short sentence for base64", () => {
    const text = "Received";
    expect(cleanInboundText(text)).toBe(text);
  });
});
