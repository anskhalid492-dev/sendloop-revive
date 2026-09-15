import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const id="d0e6b31f-aac5-4ed9-bf41-70a2fd6d1f8d";
const j = await db.from("warmup_jobs").select("status,to_email,processed_at,error").eq("sending_account_id",id);
console.log(JSON.stringify(j.data,null,1));
const d = await db.from("warmup_daily_stats").select("*").eq("sending_account_id",id);
console.log("daily", JSON.stringify(d.data));
