import { describe, expect, it } from "vitest";
import {
  allocateAcrossMailboxes,
  campaignDailyPlan,
  eligibleMailboxes,
  mailboxDailyCapacity,
  mailboxDayCapacity,
  type CapacityMailbox,
} from "@/lib/campaign-capacity";
import { buildCampaignUpdatePatch } from "@/lib/campaign-update-patch";

function mailbox(over: Partial<CapacityMailbox> = {}): CapacityMailbox {
  return {
    id: over.id ?? "m1",
    provider: "resend",
    status: "verified",
    paused: false,
    customer_enabled: true,
    daily_limit: 30,
    hourly_limit: 20,
    ...over,
  } as CapacityMailbox;
}

describe("campaign daily limit persistence", () => {
  it("maps the entered daily limit to daily_cap unchanged", () => {
    expect(buildCampaignUpdatePatch({ id: "c1", dailyCap: 700 })["daily_cap"]).toBe(700);
  });

  it("omits fields that were not edited", () => {
    const patch = buildCampaignUpdatePatch({ id: "c1", dailyCap: 700 });
    expect(patch["email_send_limit"]).toBeUndefined();
    expect(patch["name"]).toBeUndefined();
  });
});

describe("mailbox capacity", () => {
  it("uses the daily limit when the window is unknown", () => {
    expect(mailboxDayCapacity(mailbox({ daily_limit: 50 }))).toBe(50);
  });

  it("limits a mailbox by hourly limit x window hours", () => {
    expect(mailboxDayCapacity(mailbox({ daily_limit: 100, hourly_limit: 10 }), 4)).toBe(40);
  });

  it("sums only eligible mailboxes", () => {
    const pool = [
      mailbox({ id: "a" }),
      mailbox({ id: "b", paused: true }),
      mailbox({ id: "c", customer_enabled: false }),
      mailbox({ id: "d", provider: "ses" }),
    ];
    expect(eligibleMailboxes(pool, new Set(["resend"])).map((m) => m.id)).toEqual(["a"]);
    expect(mailboxDailyCapacity(pool, { allowedProviders: new Set(["resend"]) })).toBe(30);
  });
});

describe("campaignDailyPlan", () => {
  it("keeps the configured limit and reports the mailbox bottleneck", () => {
    const plan = campaignDailyPlan({ configuredLimit: 700, mailboxCapacity: 530 });
    expect(plan.configuredLimit).toBe(700);
    expect(plan.achievableLimit).toBe(530);
    expect(plan.bottleneck).toBe("mailboxes");
  });

  it("unlocks the full limit once mailbox capacity is raised", () => {
    const plan = campaignDailyPlan({ configuredLimit: 700, mailboxCapacity: 900 });
    expect(plan.achievableLimit).toBe(700);
    expect(plan.bottleneck).toBe("campaign");
  });

  it("falls back to the campaign limit when capacity is unknown", () => {
    expect(campaignDailyPlan({ configuredLimit: 700, mailboxCapacity: 0 }).achievableLimit).toBe(700);
  });
});

describe("allocateAcrossMailboxes", () => {
  it("interleaves mailboxes instead of assigning contiguous blocks", () => {
    const pool = [mailbox({ id: "a" }), mailbox({ id: "b" }), mailbox({ id: "c" })];
    expect(allocateAcrossMailboxes(6, pool)).toEqual(["a", "b", "c", "a", "b", "c"]);
  });

  it("never exceeds a mailbox's remaining daily capacity", () => {
    const pool = [mailbox({ id: "a", daily_limit: 2 }), mailbox({ id: "b", daily_limit: 1 })];
    const assigned = allocateAcrossMailboxes(10, pool);
    expect(assigned.filter((id) => id === "a")).toHaveLength(2);
    expect(assigned.filter((id) => id === "b")).toHaveLength(1);
  });

  it("respects capacity already used earlier today", () => {
    const pool = [mailbox({ id: "a", daily_limit: 3 })];
    expect(allocateAcrossMailboxes(5, pool, { usedById: new Map([["a", 3]]) })).toEqual([]);
  });

  it("skips ineligible mailboxes entirely", () => {
    const pool = [mailbox({ id: "a", status: "disconnected" }), mailbox({ id: "b" })];
    expect(new Set(allocateAcrossMailboxes(4, pool))).toEqual(new Set(["b"]));
  });
});
