const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { relayCheckMailbox, SPAM_FOLDER_CANDIDATES } = await import("@/lib/mailbox-relay.server");
const { extractInboundBody } = await import("@/lib/inbound-body");
const emails = ["anus@packologypro.shop","waqar@packologypro.online","anas@packologypro.store"];
for (const e of emails) {
  const { data } = await supabaseAdmin.from("mailboxes").select("*").eq("email_address", e).maybeSingle();
  if (!data) continue;
  const row: any = data;
  const endpoint = { host: row.imap_host, port: row.imap_port, secure: row.imap_secure, username: row.imap_username ?? row.email_address, password: row.imap_password };
  for (const folders of [undefined, SPAM_FOLDER_CANDIDATES]) {
    const res: any = await relayCheckMailbox(endpoint as any, null, folders as any);
    console.log("==", e, folders ? "junk" : "inbox", res.ok, res.message, res.folder, (res.messages??[]).length);
    for (const m of res.messages ?? []) {
      if (!/undeliver|delivery|returned|daemon/i.test(`${m.subject} ${m.from}`)) continue;
      const b = extractInboundBody(m.text, { contentType: m.contentType ?? null, contentTransferEncoding: m.contentTransferEncoding ?? null });
      console.log("--- uid", m.uid, "|", m.from, "|", m.subject);
      console.log((b.text ?? "").slice(0, 1800));
    }
  }
}
