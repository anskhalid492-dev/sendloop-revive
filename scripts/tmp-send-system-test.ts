import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalNow } from "@/lib/transactional-email.server";
import { SAMPLE_VARIABLES } from "@/lib/transactional/variables";

const to = "mranuskhalid@gmail.com";
const res = await sendTransactionalNow(supabaseAdmin, {
  eventKey: "user.created",
  to,
  variables: { ...SAMPLE_VARIABLES, "user.email": to },
  testMode: true,
  idempotencyKey: `test-user.created-${Date.now()}`,
});
console.log(JSON.stringify(res, null, 2));
