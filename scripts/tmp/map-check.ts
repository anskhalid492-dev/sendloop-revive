import { admin } from "../../src/lib/billing/core.server";
const db = await admin();
const { data } = await db
  .from("billing_plan_prices")
  .select("plan_id, billing_interval, external_price_id, environment, provider, plans(name)")
  .eq("environment", "live")
  .eq("provider", "stripe");
console.log(data?.map((r: any) => `${r.plans?.name} ${r.billing_interval} ${r.external_price_id}`).join("\n"));
