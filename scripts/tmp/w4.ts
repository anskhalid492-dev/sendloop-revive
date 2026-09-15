import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const s = await db.from("platform_settings").select("*");
console.log(JSON.stringify(s.data?.map(r=>({key:r.key,value:typeof r.value==='object'?{...r.value, token: r.value?.token?"***":undefined}:r.value})) ?? s.error, null, 2));
