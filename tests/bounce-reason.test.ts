import { describe, expect, it } from "vitest";

import { explainBounce, redactBounceReason } from "../src/lib/bounce-reason";

describe("bounce reasons", () => {
  it("names the reason and code for a missing address", () => {
    const b = explainBounce("550 5.1.1 <ans@anslol.com>: Recipient address rejected: User unknown");
    expect(b.label).toBe("Address does not exist");
    expect(b.code).toBe("5.1.1");
    expect(b.detail).toContain("User unknown");
  });

  it("recognises a full mailbox and a spam block", () => {
    expect(explainBounce("452 4.2.2 Mailbox full, over quota").label).toBe("Mailbox full");
    expect(explainBounce("554 message rejected as spam by reputation filter").label).toBe(
      "Marked as spam",
    );
  });

  it("never leaks the vendor, endpoints or keys", () => {
    const text = redactBounceReason(
      "Resend rejected the send via https://api.resend.com/emails api_key=abc123",
    );
    expect(text).not.toMatch(/resend|http|abc123/i);
    expect(text).toContain("the mail server");
  });

  it("falls back cleanly with no provider text", () => {
    const b = explainBounce(null);
    expect(b.label).toBe("Bounced");
    expect(b.detail).toBeNull();
  });
});
