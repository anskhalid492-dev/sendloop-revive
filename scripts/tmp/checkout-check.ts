import { ensureStripePrice } from "../../src/lib/billing/stripe-sync.server";
import { admin } from "../../src/lib/billing/core.server";

const db = await admin();
const { data: plans } = await db
  .from("plans")
  .select("id, name, slug, billing_type, monthly_price, yearly_price, one_time_price, is_active")
  .eq("is_active", true)
  .order("sort_order");
for (const p of plans ?? []) {
  const intervals = p.billing_type === "lifetime" ? ["lifetime"] : ["monthly", "yearly"];
  for (const i of intervals) {
    try {
      const id = await ensureStripePrice("live", p.id, i as any);
      console.log("OK  ", p.name, i, id);
    } catch (e: any) {
      console.log("FAIL", p.name, i, e?.detail ?? e?.message);
    }
  }
}
