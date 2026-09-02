import { createClient } from "@supabase/supabase-js";
import { rescheduleCampaignQueue } from "./src/lib/campaign-reschedule.server";
const sb = createClient("https://rihgzkofoxcjljlbvbya.supabase.co", process.env["SB_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const id = "57994e16-1ca1-4d08-afc0-e213cc1163cd";
const ist = (s:string)=> new Date(s).toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
async function snapshot(tag:string){
  for (const st of ["scheduled","pending","processing","sent","failed","cancelled"]) {
    const { count } = await sb.from("campaign_messages").select("id",{count:"exact",head:true}).eq("campaign_id",id).eq("status",st);
    process.stdout.write(`${tag} ${st}=${count} `);
  }
  const { data } = await sb.from("campaign_messages").select("id,scheduled_at").eq("campaign_id",id).in("status",["scheduled","pending"]).is("sent_at",null).order("scheduled_at").limit(1);
  console.log(`\n${tag} earliest=${data?.[0]?.scheduled_at} IST=${data?.[0]?.scheduled_at?ist(data[0].scheduled_at):"-"}`);
}
await snapshot("BEFORE");
const n = await rescheduleCampaignQueue(sb as any, id, new Date());
console.log("repaired rows:", n);
await snapshot("AFTER");
const dayStart = new Date("2026-09-02T18:30:00Z"); // IST day boundary
const { count: todayCount } = await sb.from("campaign_messages").select("id",{count:"exact",head:true}).eq("campaign_id",id).in("status",["scheduled","pending"]).gte("scheduled_at","2026-09-01T18:30:00Z").lt("scheduled_at",dayStart.toISOString());
console.log("today (IST) scheduled:", todayCount);
