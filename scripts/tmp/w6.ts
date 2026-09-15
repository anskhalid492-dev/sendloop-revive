import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const id="d0e6b31f-aac5-4ed9-bf41-70a2fd6d1f8d";
const j = await db.from("warmup_jobs").select("id,status,role,to_email,scheduled_at,error,attempts").eq("sending_account_id",id).order("scheduled_at").limit(30);
console.log(JSON.stringify(j.data ?? j.error, null, 1));
const st = await db.from("warmup_runner_state").select("last_run_at,last_result").single();
console.log("state", JSON.stringify(st.data));
