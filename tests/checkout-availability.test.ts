import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  readiness: [] as any[],
}));

vi.mock("@/lib/billing/core.server", () => ({
  admin: vi.fn(),
  getBillingSettings: async () => ({ environment: "test" }),
  isConfigured: vi.fn(),
  writeAudit: vi.fn(),
}));
vi.mock("@/lib/billing/providers.server", () => ({ getBillingAdapter: vi.fn() }));
vi.mock("@/lib/billing/entitlements.server", () => ({ getEntitlement: vi.fn() }));
vi.mock("@/lib/billing/readiness.server", () => ({ loadReadiness: async () => state.readiness }));

import { availableProviders } from "@/lib/billing/customer.server";

const stripeState = (plans: any[], enabled = true, credentialsOk = true) => ({
  provider: "stripe",
  environment: "test",
  enabled,
  credentials: { ok: credentialsOk, missing: credentialsOk ? [] : ["STRIPE_SECRET_KEY_TEST"] },
  plans,
});

const recurring = (id: string, monthly: boolean, yearly: boolean) => ({
  planId: id,
  planName: id,
  billingType: "recurring",
  monthly: { ok: monthly },
  yearly: { ok: yearly },
  lifetime: { ok: false },
});
const lifetime = (id: string, ok: boolean) => ({
  planId: id,
  planName: id,
  billingType: "lifetime",
  monthly: { ok: true },
  yearly: { ok: true },
  lifetime: { ok },
});

beforeEach(() => {
  state.readiness = [];
});

describe("checkout availability is per plan, not all-or-nothing", () => {
  it("stays available when one recurring plan is missing a price ID", async () => {
    state.readiness = [
      stripeState([recurring("starter", true, true), recurring("growth", false, true)]),
    ];
    const [stripe] = await availableProviders();
    expect(stripe.available).toBe(true);
    expect(stripe.plans["starter"]).toEqual({ monthly: true, yearly: true, lifetime: false });
    expect(stripe.plans["growth"]).toEqual({ monthly: false, yearly: true, lifetime: false });
  });

  it("stays available when a lifetime plan has no price mapping", async () => {
    state.readiness = [
      stripeState([recurring("starter", true, true), lifetime("lifetime-starter", false)]),
    ];
    const [stripe] = await availableProviders();
    expect(stripe.available).toBe(true);
    expect(stripe.plans["lifetime-starter"].lifetime).toBe(false);
  });

  it("is unavailable when no plan is purchasable", async () => {
    state.readiness = [stripeState([recurring("starter", false, false)])];
    const [stripe] = await availableProviders();
    expect(stripe.available).toBe(false);
    expect(stripe.reason).toBe("Plan IDs incomplete");
  });

  it("is unavailable when the provider is disabled or credentials are missing", async () => {
    state.readiness = [stripeState([recurring("starter", true, true)], false)];
    expect((await availableProviders())[0].available).toBe(false);
    state.readiness = [stripeState([recurring("starter", true, true)], true, false)];
    expect((await availableProviders())[0].available).toBe(false);
  });
});
