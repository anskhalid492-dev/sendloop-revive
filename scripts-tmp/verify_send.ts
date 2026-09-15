import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { resolveManagedProvider } = await import("@/lib/managed-sending.server");
const { getAdapter } = await import("@/lib/providers/adapter.server");
const m = await resolveManagedProvider(supabaseAdmin, { provider: "resend", provider_id: null, from_email: "support@munchreach.com" }, { scope: "system" });
console.log("resolved (asked for resend):", m?.provider, m?.source);
if (m) {
  const out = await getAdapter(m.provider).sendEmail(m.credentials, {
    fromName: "MunchReach Support",
    fromEmail: "support@munchreach.com",
    to: "anuskhalid492@gmail.com",
    subject: "MunchReach provider routing verification",
    text: "Automated verification: dynamic provider routing now sends via the active provider.",
  });
  console.log("send:", JSON.stringify({ ok: out.ok, code: out.statusCode, msg: out.message }));
}
