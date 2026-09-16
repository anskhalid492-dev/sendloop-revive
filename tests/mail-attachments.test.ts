import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_LIMIT_MESSAGE,
  MAX_TOTAL_ATTACHMENT_BYTES,
  archivedAttachments,
  assertAttachmentsWithinLimit,
  attachmentBytes,
  relayAttachments,
  totalAttachmentBytes,
} from "@/lib/mail-attachments";

const base64OfBytes = (count: number) => btoa("x".repeat(count));

describe("manual-send attachments", () => {
  it("measures real size from the encoded content, not the reported size", () => {
    expect(attachmentBytes({ content: base64OfBytes(3000), size: 1 })).toBe(3000);
  });

  it("falls back to the reported size for link-only entries", () => {
    expect(attachmentBytes({ url: "https://example.com/a.pdf", size: 2048 })).toBe(2048);
  });

  it("accepts a normal set of files", () => {
    const files = [
      { name: "a.pdf", contentType: "application/pdf", content: base64OfBytes(1024) },
      { name: "b.png", contentType: "image/png", content: base64OfBytes(2048) },
    ];
    expect(() => assertAttachmentsWithinLimit(files)).not.toThrow();
    expect(totalAttachmentBytes(files)).toBe(3072);
  });

  it("refuses a set that exceeds what mail providers carry", () => {
    const files = [
      { name: "big.zip", content: base64OfBytes(MAX_TOTAL_ATTACHMENT_BYTES + 1) },
    ];
    expect(() => assertAttachmentsWithinLimit(files)).toThrow(ATTACHMENT_LIMIT_MESSAGE);
  });

  it("refuses more than ten files", () => {
    const files = Array.from({ length: 11 }, (_, index) => ({
      name: `f${index}.txt`,
      content: base64OfBytes(10),
    }));
    expect(() => assertAttachmentsWithinLimit(files)).toThrow(/up to 10 files/);
  });

  it("archives metadata only — never the file bytes", () => {
    const archived = archivedAttachments([
      { name: "a.pdf", contentType: "application/pdf", content: base64OfBytes(1024) },
    ]);
    expect(archived).toEqual([{ name: "a.pdf", contentType: "application/pdf", size: 1024 }]);
    expect(JSON.stringify(archived)).not.toContain(base64OfBytes(1024));
  });

  it("hands the relay only entries that carry content", () => {
    const relayed = relayAttachments([
      { name: "a.pdf", contentType: "application/pdf", content: base64OfBytes(8) },
      { name: "link.txt", url: "https://example.com/link.txt", size: 10 },
    ]);
    expect(relayed).toEqual([
      { filename: "a.pdf", contentType: "application/pdf", contentBase64: base64OfBytes(8) },
    ]);
  });

  it("defaults a missing content type so MIME parts stay valid", () => {
    expect(relayAttachments([{ name: "x", content: base64OfBytes(4) }])[0]?.contentType).toBe(
      "application/octet-stream",
    );
  });
});
