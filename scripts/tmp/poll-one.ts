const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { pollMailbox } = await import("@/lib/mailbox-imap-poll.server");
const { data } = await supabaseAdmin.from("mailboxes").select("id, workspace_id, email_address, imap_host, imap_port, imap_secure, imap_username, imap_password, last_imap_uid, status, is_active").eq("email_address","anas@packologypro.online").maybeSingle();
console.log("cursor", (data as any)?.last_imap_uid);
const out = await pollMailbox(supabaseAdmin, data as any);
console.log(JSON.stringify(out, null, 2));
