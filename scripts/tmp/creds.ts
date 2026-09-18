const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { data } = await supabaseAdmin.from("mailboxes").select("email_address, imap_host, imap_port, imap_secure, imap_username, imap_password").eq("email_address","anas@packologypro.online").maybeSingle();
const row: any = data;
const { data: pw } = await supabaseAdmin.rpc("mailbox_read_secret", { _id: row.imap_password });
await Bun.write("/tmp/creds.json", JSON.stringify({ host: row.imap_host, port: row.imap_port, user: row.imap_username, pass: String(pw) }));
console.log("ok", row.imap_host, row.imap_port);
