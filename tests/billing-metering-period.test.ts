import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptions: Record<string, Record<string, unknown> | null> = {};
const plans: Record<string, Record<string, unknown> | null> = {};

function queryFor(table: string) {
  const state = { id: "" };
  const chain = {
    select: () => chain,
    eq: (_column: string, value: string) => {
      if (_column === "workspace_id" || _column === "id") state.id = value;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({
      data: table === "billing_subscriptions" ? subscriptions[state.id] ?? null : plans[state.id] ?? null,
    }),
  };
  return chain;
}

vi.mock("@/lib/billing/core.server", () => ({
  admin: vi.fn(async () => ({
    from: (table: string) => queryFor(table),
  })),
  getBillingSettings: vi.fn(async () => ({ environment: "live" })),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T12:00:00.000Z"));
  for (const key of Object.keys(subscriptions)) delete subscriptions[key];
  for (const key of Object.keys(plans)) delete plans[key];
});

describe("billing metering periods", () => {
  it("keeps Free Trial on a fixed total allowance", async () => {
    subscriptions["w-free"] = {
      status: "trialing",
      plan_id: "free-plan",
      billing_interval: "monthly",
      current_period_start: "2026-09-01T00:00:00.000Z",
      current_period_end: "2026-10-01T00:00:00.000Z",
    };
    plans["free-plan"] = { monthly_price: 0, billing_type: "recurring" };

    const { getMeteringPeriod } = await import("@/lib/billing/usage.server");
    await expect(getMeteringPeriod("w-free")).resolves.toMatchObject({
      key: "1970-01-01",
      resets: false,
    });
  });

  it("uses provider billing periods for monthly paid subscriptions", async () => {
    subscriptions["w-monthly"] = {
      status: "active",
      plan_id: "starter-plan",
      billing_interval: "monthly",
      current_period_start: "2026-09-12T08:00:00.000Z",
      current_period_end: "2026-10-12T08:00:00.000Z",
    };
    plans["starter-plan"] = { monthly_price: 3900, billing_type: "recurring" };

    const { getMeteringPeriod } = await import("@/lib/billing/usage.server");
    await expect(getMeteringPeriod("w-monthly")).resolves.toMatchObject({
      key: "2026-09-12",
      end: "2026-10-12T08:00:00.000Z",
      resets: true,
    });
  });

  it("uses UTC calendar-month periods for yearly paid subscriptions", async () => {
    subscriptions["w-yearly"] = {
      status: "active",
      plan_id: "growth-plan",
      billing_interval: "yearly",
      current_period_start: "2026-05-05T08:00:00.000Z",
      current_period_end: "2027-05-05T08:00:00.000Z",
    };
    plans["growth-plan"] = { monthly_price: 7900, billing_type: "recurring" };

    const { getMeteringPeriod } = await import("@/lib/billing/usage.server");
    await expect(getMeteringPeriod("w-yearly")).resolves.toMatchObject({
      key: "2026-09-01",
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
      resets: true,
    });
  });

  it("uses UTC calendar-month periods for lifetime purchases", async () => {
    subscriptions["w-lifetime"] = {
      status: "active",
      plan_id: "lifetime-plan",
      billing_interval: "lifetime",
      current_period_start: "2026-01-01T00:00:00.000Z",
      current_period_end: null,
    };
    plans["lifetime-plan"] = { monthly_price: 0, billing_type: "lifetime" };

    const { getMeteringPeriod } = await import("@/lib/billing/usage.server");
    await expect(getMeteringPeriod("w-lifetime")).resolves.toMatchObject({
      key: "2026-09-01",
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
      resets: true,
    });
  });
});