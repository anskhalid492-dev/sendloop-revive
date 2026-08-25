import { describe, expect, it } from "vitest";

import { normalizeInbound } from "../src/lib/inbound-parse";

describe("inbound payload normalization", () => {
  it("keeps the plus-routed recipient from array payloads", () => {
    const normalized = normalizeInbound({
      type: "email.received",
      data: {
        from: "Gmail Prospect <prospect@gmail.com>",
        to: ["anus+abc123xyz789@verifiedusaleads.com"],
        subject: "Totally different subject",
        headers: [{ name: "Message-ID", value: "<gmail-reply@mail.gmail.com>" }],
      },
    });

    expect(normalized?.to).toBe("anus+abc123xyz789@verifiedusaleads.com");
    expect(normalized?.messageId).toBe("<gmail-reply@mail.gmail.com>");
  });

  it("prefers envelope/header recipients with routing tokens over rewritten To headers", () => {
    const normalized = normalizeInbound({
      from: "Gmail Prospect <prospect@gmail.com>",
      to: "MunchReach <inbound@provider.invalid>",
      envelope: { to: ["anus+abc123xyz789@verifiedusaleads.com"] },
      headers: [
        { key: "Delivered-To", value: "anus+abc123xyz789@verifiedusaleads.com" },
        { name: "To", value: "MunchReach <inbound@provider.invalid>" },
        { Name: "In-Reply-To", Value: "<original@munchreach.local>" },
      ],
    });

    expect(normalized?.to).toBe("anus+abc123xyz789@verifiedusaleads.com");
    expect(normalized?.inReplyTo).toBe("<original@munchreach.local>");
  });
});