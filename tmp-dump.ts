import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
for (const id of ["1680d937-4450-4dd2-97f7-e0ae1d2cb9aa","cfa8479f-52ec-446d-8100-019a0e4a10d2","40bd68e8-9207-4a80-bc58-fc8a75888c69"]) {
  const { data } = await db.from("conversation_messages").select("body").eq("id", id).single();
  console.log("=====", id);
  console.log((data as any).body.slice(0, 900).replace(/\r/g, "<CR>"));
}
