import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processTransactionalQueue } from "@/lib/transactional-email.server";
console.log(JSON.stringify(await processTransactionalQueue(supabaseAdmin, { limit: 5 }), null, 2));
