import { supabaseAdmin } from "@/integrations/supabase/client.server";
console.log("env SUPABASE_URL:", process.env["SUPABASE_URL"]);
const { data } = await supabaseAdmin.from("transactional_emails").select("id,status,to_email,provider,error,sent_at").order("created_at",{ascending:false}).limit(3);
console.log(JSON.stringify(data,null,2));
