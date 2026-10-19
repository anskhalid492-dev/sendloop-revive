import { describe, expect, it } from "vitest";
import { classifyEmailOutcome } from "../src/lib/email-outcome";

describe("named permanent errors are bounced", () => {
  it("554 READ is bounced", () => expect(classifyEmailOutcome("554 READ").outcome).toBe("bounced"));
  it("550 permanent is bounced", () => expect(classifyEmailOutcome("550 permanent").outcome).toBe("bounced"));
  it("550 No mailbox is bounced", () => expect(classifyEmailOutcome("550 No mailbox by that name").outcome).toBe("bounced"));
  it("sender blocks stay failed", () => {
    expect(classifyEmailOutcome("554 5.7.1 Outbound sending is disabled for this account").outcome).toBe("failed");
    expect(classifyEmailOutcome("550 5.7.1 [CS] Message blocked").outcome).toBe("failed");
  });
});
