import { describe, expect, it } from "vitest";
import {
  MAILBOX_RETRY_DELAY_MS,
  isEligibleMailbox,
  mailboxRetryAt,
  selectMailboxForMessage,
} from "@/lib/mailbox-assignment";

const mailbox = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  paused: false,
  customer_enabled: true,
  status: "active",
  daily_limit: 50,
  ...over,
});

describe("isEligibleMailbox", () => {
  it("accepts an active, enabled, unpaused mailbox", () => {
    expect(isEligibleMailbox(mailbox("a"))).toBe(true);
  });
  it("rejects paused, disabled, customer-disabled and missing mailboxes", () => {
    expect(isEligibleMailbox(mailbox("a", { paused: true }))).toBe(false);
    expect(isEligibleMailbox(mailbox("a", { status: "disabled" }))).toBe(false);
    expect(isEligibleMailbox(mailbox("a", { customer_enabled: false }))).toBe(false);
    expect(isEligibleMailbox(undefined)).toBe(false);
  });
});

describe("selectMailboxForMessage", () => {
  const accountsById = new Map([
    ["a", mailbox("a")],
    ["b", mailbox("b")],
    ["paused", mailbox("paused", { paused: true })],
  ]);

  it("assigns the least-loaded eligible mailbox from the campaign pool", () => {
    const picked = selectMailboxForMessage({
      poolIds: ["a", "b"],
      accountsById,
      usageById: new Map([
        ["a", 10],
        ["b", 2],
      ]),
    });
    expect(picked).toBe("b");
  });

  it("skips ineligible mailboxes", () => {
    expect(
      selectMailboxForMessage({ poolIds: ["paused", "a"], accountsById }),
    ).toBe("a");
  });

  it("returns null when every mailbox is at capacity (temporary)", () => {
    expect(
      selectMailboxForMessage({
        poolIds: ["a", "b"],
        accountsById,
        usageById: new Map([
          ["a", 50],
          ["b", 50],
        ]),
      }),
    ).toBeNull();
  });

  it("returns null when the campaign has no mailbox pool", () => {
    expect(selectMailboxForMessage({ poolIds: [], accountsById })).toBeNull();
  });
});

describe("mailboxRetryAt", () => {
  const now = new Date("2026-08-28T20:00:00.000Z");

  it("retries shortly after now while the window is still open", () => {
    const next = new Date("2026-08-29T20:00:00.000Z");
    expect(mailboxRetryAt(now, next).toISOString()).toBe(
      new Date(now.getTime() + MAILBOX_RETRY_DELAY_MS).toISOString(),
    );
  });

  it("never schedules past the next window start", () => {
    const next = new Date("2026-08-28T20:05:00.000Z");
    expect(mailboxRetryAt(now, next).toISOString()).toBe(next.toISOString());
  });
});
