import { syncStripePrices } from "../src/lib/billing/stripe-sync.server";
const r = await syncStripePrices("test", "00000000-0000-0000-0000-000000000000");
console.log(JSON.stringify(r, null, 2));
