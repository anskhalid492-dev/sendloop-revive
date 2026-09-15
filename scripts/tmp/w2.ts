import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const a = await db.from("sending_accounts").select("*").ilike("from_email","michael@meetsmartoutreach.agency");
if (a.error) { const b = await db.from("sending_accounts").select("*").limit(1); console.log("cols", Object.keys(b.data?.[0]??{})); }
console.log("account", JSON.stringify(a.data ?? a.error, null, 2));
