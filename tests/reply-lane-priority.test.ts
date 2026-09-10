import { expect, test } from "vitest";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";
import { campaignHourlyLimit, effectiveMailboxHourlyLimit, replyReserveForHourlyLimit } from "@/lib/mailbox-hourly-cap";

const base = {
  id: "a",
  from_name: "M",
  from_email: "m@x.com",
  paused: false,
  customer_enabled: true,
  status: "active",
  last_sent_at: new Date().toISOString(),
};

test("campaigns never get 100% of a mailbox hour", () => {
  expect(campaignHourlyLimit(30)).toBeLessThan(effectiveMailboxHourlyLimit(30));
  expect(replyReserveForHourlyLimit(30)).toBeGreaterThanOrEqual(1);
});

test("campaign lane blocks at the reserved hourly limit", () => {
  const c = evaluateMailboxCapacity({ ...base, sent_today: 5, daily_limit: 500, hourly_limit: 30 }, campaignHourlyLimit(30), undefined, "campaign");
  expect(c.available).toBe(false);
  expect(c.reason).toBe("hourly");
});

test("human reply still allowed when campaign hourly limit is consumed", () => {
  const c = evaluateMailboxCapacity({ ...base, sent_today: 5, daily_limit: 500, hourly_limit: 30 }, 30, undefined, "reply");
  expect(c.available).toBe(true);
});

test("human reply still allowed when daily campaign limit is consumed", () => {
  const c = evaluateMailboxCapacity({ ...base, sent_today: 500, daily_limit: 500, hourly_limit: 30 }, 0, undefined, "reply");
  expect(c.available).toBe(true);
});

test("paused or disabled mailboxes still block replies", () => {
  expect(evaluateMailboxCapacity({ ...base, paused: true, sent_today: 0, daily_limit: 50 }, 0, undefined, "reply").reason).toBe("paused");
  expect(evaluateMailboxCapacity({ ...base, customer_enabled: false, sent_today: 0, daily_limit: 50 }, 0, undefined, "reply").reason).toBe("disabled");
});
