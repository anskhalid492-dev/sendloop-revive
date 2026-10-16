import { describe, expect, it } from "vitest";
import { lifetimeOffers, lifetimePriceCents, lifetimeBillingHref, validateLifetimeStripePrice } from "@/lib/billing/lifetime";
const original = { id: "test-lifetime-original", slug: "lifetime", billing_type: "lifetime", one_time_price: 9900 };
const starter = { id: "test-lifetime-starter", slug: "lifetime-starter", billing_type: "lifetime", one_time_price: 2900 };
describe("Lifetime Starter shared rules — no network", () => {
  it("prices Starter at $29 once", () => { expect(lifetimePriceCents(starter)).toBe(2900); });
  it("keeps original at its configured price", () => { expect(lifetimePriceCents(original)).toBe(9900); expect(lifetimePriceCents({ ...original, one_time_price: 12300 })).toBe(12300); });
  it("shows the cheaper lifetime first without mutating input", () => { const input = [original, starter]; expect(lifetimeOffers(input)).toEqual([starter, original]); expect(input).toEqual([original, starter]); });
  it("carries the selected plan ID to customer billing", () => { expect(lifetimeBillingHref(starter)).toBe("/billing?plan=test-lifetime-starter"); });
  const price = { active: true, type: "one_time", currency: "usd", unit_amount: 2900, product: { active: true } };
  it("accepts one-time $29 USD", () => { expect(() => validateLifetimeStripePrice(price, 2900)).not.toThrow(); });
  it("rejects recurring prices", () => { expect(() => validateLifetimeStripePrice({ ...price, recurring: { interval: "month" } }, 2900)).toThrow(/one-time/); });
  it("rejects non-USD prices", () => { expect(() => validateLifetimeStripePrice({ ...price, currency: "eur" }, 2900)).toThrow(/USD/); });
  it("rejects mismatched price amounts", () => { expect(() => validateLifetimeStripePrice({ ...price, unit_amount: 9900 }, 2900)).toThrow(/amount/); });
  it("rejects archived prices or products", () => { expect(() => validateLifetimeStripePrice({ ...price, active: false }, 2900)).toThrow(); expect(() => validateLifetimeStripePrice({ ...price, product: { active: false } }, 2900)).toThrow(); });
});