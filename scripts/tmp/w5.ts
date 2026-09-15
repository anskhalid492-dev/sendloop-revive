import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const { data } = await db.from("platform_settings").select("value").eq("key","warmup_runner").maybeSingle();
const v:any = data?.value;
const res = await fetch(v.url, { method:"POST", headers:{ "content-type":"application/json", "x-sendloop-signature": v.token }, body: JSON.stringify({limit:5})});
console.log(res.status, (await res.text()).slice(0,1200));
