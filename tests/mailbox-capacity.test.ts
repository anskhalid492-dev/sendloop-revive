import { expect, test } from "vitest";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";
const base = { id: "a", from_name: "M", from_email: "m@x.com", paused: false, customer_enabled: true, status: "active", last_sent_at: new Date().toISOString() };
test("below daily", () => expect(evaluateMailboxCapacity({ ...base, sent_today: 12, daily_limit: 50, hourly_limit: 20 }, 3).available).toBe(true));
test("at daily", () => { const c = evaluateMailboxCapacity({ ...base, sent_today: 30, daily_limit: 30, hourly_limit: 20 }, 0); expect(c.available).toBe(false); expect(c.reason).toBe("daily"); });
test("at hourly", () => { const c = evaluateMailboxCapacity({ ...base, sent_today: 5, daily_limit: 50, hourly_limit: 10 }, 10); expect(c.reason).toBe("hourly"); });
test("paused", () => expect(evaluateMailboxCapacity({ ...base, paused: true, sent_today: 0, daily_limit: 50 }).reason).toBe("paused"));
