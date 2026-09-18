const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { relayCheckMailbox, SPAM_FOLDER_CANDIDATES } = await import("@/lib/mailbox-relay.server");
const { data } = await supabaseAdmin.from("mailboxes").select("id, workspace_id, email_address, imap_host, imap_port, imap_secure, imap_username, imap_password, last_imap_uid, last_spam_imap_uid, status, is_active").eq("email_address","anas@packologypro.online").maybeSingle();
console.log("cursors", data?.last_imap_uid, data?.last_spam_imap_uid);
const imap = { host: data.imap_host, port: data.imap_port, secure: data.imap_secure, username: data.imap_username, password: data.imap_password };
const inbox = await relayCheckMailbox(imap as any, data.last_imap_uid ?? null);
console.log("INBOX ->", inbox.ok, "folder:", inbox.folder, "msgs:", inbox.messages.length, inbox.message);
const junk = await relayCheckMailbox(imap as any, data.last_spam_imap_uid ?? null, SPAM_FOLDER_CANDIDATES);
console.log("JUNK ->", junk.ok, "folder:", junk.folder, "msgs:", junk.messages.length, junk.message);
