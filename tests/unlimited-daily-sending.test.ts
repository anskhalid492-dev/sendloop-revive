/**
 * Plan-based daily sending caps were removed platform-wide. Even if a plan row
 * still carries a historical max_emails_daily value, the entitlement layer must
 * report it as unlimited (null) so no sending path — campaign, queue, scheduler,
 * follow-ups or manual sends — can be blocked by a stale daily cap.
 */
import { describe, expect, it, vi } from "vitest";

const PLAN_WITH_LEGACY_DAILY_CAP = {
  id: "plan-1",
  name: "Starter",
  monthly_price: 4900,
  billing_type: "subscription",
  max_emails_monthly: 20000,
  max_emails_daily: 50, // legacy value that must be ignored
  max_warmup_daily: 20,
};

vi.mock("@/lib/billing/core.server", () => ({
  admin: vi.fn(async () => ({
    from(table: string) {
      const single =
        table === "billing_subscriptions"
          ? null
          : table === "plans"
            ? PLAN_WITH_LEGACY_DAILY_CAP
            : table === "workspace_credits"
              ? { balance: 0 }
              : null;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.order = self;
      chain.limit = self;
      chain.not = self;
      chain.maybeSingle = async () => ({ data: single });
      chain.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: [] });
      return chain;
    },
  })),
  getBillingSettings: vi.fn(async () => ({ environment: "live" })),
}));

vi.mock("@/lib/billing/plan-grants.server", () => ({
  activeGrantWithPlan: vi.fn(async () => null),
}));

describe("unlimited daily sending entitlement", () => {
  it("reports max_emails_daily as unlimited even when the plan row has a legacy cap", async () => {
    const { getEntitlement } = await import("@/lib/billing/entitlements.server");
    const entitlement = await getEntitlement("ws-1");
    expect(entitlement.limits.max_emails_daily).toBeNull();
  });

  it("keeps monthly and warmup limits untouched", async () => {
    const { getEntitlement } = await import("@/lib/billing/entitlements.server");
    const entitlement = await getEntitlement("ws-1");
    expect(entitlement.limits.max_emails_monthly).toBe(20000);
    expect(entitlement.limits.max_warmup_daily).toBe(20);
  });

  it("the pricing comparison shows Daily Sending Limit as Unlimited for every plan", async () => {
    const { PRICING_COMPARISON } = await import("@/lib/pricing-comparison");
    const row = PRICING_COMPARISON.flatMap((c) => c.rows).find((r) => r.label === "Daily Sending Limit");
    expect(row).toBeDefined();
    const fakePlan = { max_emails_daily: 500 } as never;
    expect(row!.value(fakePlan)).toBe("Unlimited");
  });
});
