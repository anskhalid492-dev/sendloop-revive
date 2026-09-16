import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processTransactionalQueue } from "@/lib/transactional-email.server";
// Scoped strictly to the throwaway test row created for mranuskhalid@gmail.com.
const id = "fede7e7c-0417-4af7-80e0-5183a1933efa";
console.log(JSON.stringify(await processTransactionalQueue(supabaseAdmin, { onlyId: id }), null, 2));
const { data } = await supabaseAdmin.from("transactional_emails")
  .select("status, provider, provider_message_id, error, from_email, to_email, subject, sent_at").eq("id", id).maybeSingle();
console.log(JSON.stringify(data, null, 2));
