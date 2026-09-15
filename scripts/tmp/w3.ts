import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const id="d0e6b31f-aac5-4ed9-bf41-70a2fd6d1f8d";
for (const t of ["warmup_settings","warmup_jobs","warmup_daily_stats","warmup_health"]) {
  const r = await db.from(t).select("*").eq("sending_account_id", id).limit(5);
  console.log(t, JSON.stringify(r.data ?? r.error));
}
const rec = await db.from("warmup_recipients").select("*").limit(2);
console.log("recipients", rec.count, JSON.stringify(rec.data ?? rec.error));
const all = await db.from("warmup_jobs").select("id,status,scheduled_at,sending_account_id").order("created_at",{ascending:false}).limit(5);
console.log("recent jobs", JSON.stringify(all.data ?? all.error));
