import { admin } from "../src/lib/billing/core.server";
const db = await admin();
const r = await db.from("plans").select("id,name,is_active,billing_type,one_time_price");
console.log(r.error, r.data);
