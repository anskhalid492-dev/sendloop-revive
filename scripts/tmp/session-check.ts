import { getBillingAdapter, stripeCall } from "../../src/lib/billing/providers.server";
import { ensureStripePrice } from "../../src/lib/billing/stripe-sync.server";
import { admin } from "../../src/lib/billing/core.server";

const db = await admin();
const { data: plans } = await db
  .from("plans")
  .select("id, name, billing_type, is_active")
  .eq("is_active", true)
  .order("sort_order");
const adapter = getBillingAdapter("stripe");
for (const p of plans ?? []) {
  const intervals = p.billing_type === "lifetime" ? ["lifetime"] : ["monthly", "yearly"];
  for (const i of intervals) {
    try {
      const priceId = await ensureStripePrice("live", p.id, i as any);
      const res = await adapter.createCheckout({
        environment: "live",
        priceId,
        workspaceId: "00000000-0000-0000-0000-000000000000",
        planId: p.id,
        interval: i as any,
        mode: i === "lifetime" ? "payment" : "subscription",
        email: "throwaway-checkout-test@munchreach.com",
        customerId: null,
        successUrl: "https://munchreach.com/settings?tab=billing&checkout=success",
        cancelUrl: "https://munchreach.com/settings?tab=billing&checkout=cancelled",
      });
      const id = new URL(res.url).pathname.split("/").pop();
      console.log("SESSION OK", p.name, i);
      const sid = (res as any).sessionId;
      if (sid) await stripeCall("live", `checkout/sessions/${sid}/expire`, {});
    } catch (e: any) {
      console.log("SESSION FAIL", p.name, i, e?.detail ?? e?.message);
    }
  }
}
