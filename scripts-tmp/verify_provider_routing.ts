import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { resolveMailboxSendingProvider } = await import("@/lib/mailbox-sending-provider.server");
const { resolveManagedProvider, sendManagedEmail } = await import("@/lib/managed-sending.server");

const { data: rows } = await supabaseAdmin
  .from("sending_accounts")
  .select("id, workspace_id, provider, provider_id, from_email, from_name")
  .limit(60);
const list = (rows ?? []) as any[];
console.log("mailboxes:", list.length);
for (const a of list.slice(0, 8)) {
  const r = await resolveMailboxSendingProvider(supabaseAdmin, a);
  const m = await resolveManagedProvider(supabaseAdmin, a);
  console.log(`stored=${a.provider} from=${a.from_email} -> resolved=${r?.provider ?? "REFUSED"} managed=${m?.provider ?? "REFUSED"} src=${m?.source}`);
}
// system scope (transactional / admin identities)
const sys = await resolveManagedProvider(supabaseAdmin, { provider: "", provider_id: null, from_email: "support@munchreach.com" }, { scope: "system" });
console.log("system scope ->", sys?.provider ?? "REFUSED");

const target = list.find((a) => (a.from_email as string)?.endsWith("@munchreach.com")) ?? list[0];
if (target) {
  console.log("real send from", target.from_email, "stored provider", target.provider);
  const out = await sendManagedEmail(
    supabaseAdmin,
    { id: target.id, workspace_id: target.workspace_id, provider: target.provider, provider_id: target.provider_id, from_email: target.from_email },
    { fromName: target.from_name ?? "MunchReach", fromEmail: target.from_email, to: "anuskhalid492@gmail.com", subject: "MunchReach provider routing test", text: "Automated verification of dynamic provider routing." },
    { stage: "test" },
  );
  console.log("send:", JSON.stringify({ ok: out.ok, code: out.statusCode, msg: out.message, raw: out.providerResponse, src: out.credentialSource }));
}
