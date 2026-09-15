import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const a = await db.from("sending_accounts").select("id,email,workspace_id,warmup_enabled,warmup_status,warmup_started_at,warmup_stage,provider_id,connection_method,is_enabled,paused_at,health_score,daily_limit,created_at").ilike("email","michael@meetsmartoutreach.agency");
console.log("account", JSON.stringify(a.data ?? a.error, null, 2));
const id = a.data?.[0]?.id;
const st = await db.from("warmup_runner_state").select("*");
console.log("runner_state", JSON.stringify(st.data ?? st.error));
if (id) {
  const s = await db.from("warmup_settings").select("*").eq("sending_account_id", id);
  console.log("settings", JSON.stringify(s.data ?? s.error, null, 2));
  const j = await db.from("warmup_jobs").select("*").eq("sending_account_id", id).order("created_at",{ascending:false}).limit(5);
  console.log("jobs", JSON.stringify(j.data ?? j.error, null, 2));
  const h = await db.from("warmup_health").select("*").eq("sending_account_id", id);
  console.log("health", JSON.stringify(h.data ?? h.error));
  const d = await db.from("warmup_daily_stats").select("*").eq("sending_account_id", id).order("stat_date",{ascending:false}).limit(5);
  console.log("daily", JSON.stringify(d.data ?? d.error));
}
const r = await db.from("warmup_recipients").select("id,is_active",{count:"exact",head:false}).limit(3);
console.log("recipients sample", r.count, JSON.stringify(r.data ?? r.error));
