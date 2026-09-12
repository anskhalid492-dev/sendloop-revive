import { describe, expect, it } from "vitest";
import { inboundPayloadSchema, normalizeInbound } from "../inbound-parse";

function parseInbound(attachments?: unknown[]) {
  const normalized = normalizeInbound({
    type: "email.received",
    data: {
      from: "Prospect <prospect@example.com>",
      to: ["reply+abcdefgh@example.com"],
      subject: "Re: hello",
      text: "Reply body",
      ...(attachments === undefined ? {} : { attachments }),
    },
  });

  return inboundPayloadSchema.parse(normalized);
}

describe("inbound attachment normalization", () => {
  it("processes an inbound email with no attachments", () => {
    expect(parseInbound().attachments).toEqual([]);
  });

  it("preserves a normally named attachment", () => {
    expect(parseInbound([{ name: "proposal.pdf", url: "https://files.example/proposal.pdf", size: 1200 }]).attachments)
      .toEqual([{ name: "proposal.pdf", url: "https://files.example/proposal.pdf", size: 1200 }]);
  });

  it("maps Resend filename fields to the shared attachment name", () => {
    expect(parseInbound([{ filename: "invoice.pdf", content_type: "application/pdf" }]).attachments)
      .toEqual([{ name: "invoice.pdf" }]);
  });

  it("uses a deterministic fallback when the attachment name is missing", () => {
    expect(parseInbound([{ content_type: "image/png", size: 42 }]).attachments)
      .toEqual([{ name: "attachment-1.png", size: 42 }]);
  });

  it("uses a deterministic fallback when the attachment name is blank", () => {
    expect(parseInbound([{ filename: "   " }]).attachments)
      .toEqual([{ name: "attachment-1" }]);
  });
});