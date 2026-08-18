/**
 * Composing a brand new email from the Unified Inbox.
 *
 * The customer picks one of their assigned mailboxes; credentials are resolved
 * server-side and never leave this module. A successful send creates (or
 * reuses) the conversation thread so the reply lands in the same place.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildThreadKey, previewOf, stripAngle } from "@/lib/inbox-model";

type AnyClient = { from: (table: string) => any };

export type ComposeInput = {
  supabase: AnyClient;
  userId: string;
  workspaceId: string;
  sendingAccountId: string;
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  leadId: string | null;
  attachments: { name: string; url: string }[];
};

export async function composeAndSend(input: ComposeInput) {
  const { getAdapter, readCredentials } = await import("@/lib/providers/adapter.server");
  const { resolveReplyTo } = await import("@/lib/inbox-send.server");
  const supabase = input.supabase;
  const to = input.to.trim().toLowerCase();

  const { data: account, error: accountError } = await supabase
    .from("sending_accounts")
    .select(
      "id, provider, provider_id, from_name, from_email, reply_to, paused, customer_enabled, status, sent_today, daily_limit, workspace_id",
    )
    .eq("id", input.sendingAccountId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account || account.workspace_id !== input.workspaceId) {
    throw new Error("That mailbox is not available in this workspace.");
  }
  if (account.paused || !account.customer_enabled || account.status === "disabled") {
    throw new Error("That mailbox is currently unavailable.");
  }
  if ((account.sent_today ?? 0) >= (account.daily_limit ?? 0)) {
    throw new Error("This mailbox has reached its daily sending limit.");
  }

  let credentials: Record<string, string> | null = null;
  if (account.provider_id) {
    const { data: secret } = await supabaseAdmin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", account.provider_id)
      .maybeSingle();
    if (secret?.credentials_ciphertext) {
      try {
        credentials = readCredentials(secret.credentials_ciphertext);
      } catch {
        credentials = null;
      }
    }
  }
  const envFallback = account.provider === "resend" && Boolean(process.env["RESEND_API_KEY"]);
  if (!credentials && !envFallback) {
    throw new Error("Sending is temporarily unavailable for this mailbox.");
  }

  // Resolve the lead so the conversation is attached to the CRM record.
  let leadId = input.leadId;
  if (!leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("email", to)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  const { isSuppressed } = await import("@/lib/suppression.server");
  const blocked = await isSuppressed(input.workspaceId, to);
  if (blocked) {
    throw new Error(`This address is on your suppression list (${blocked}) and cannot be emailed.`);
  }

  const adapter = getAdapter(account.provider);
  const baseReplyTo = await resolveReplyTo(account.provider_id, account.reply_to);
  const { mintReplyAddress } = await import("@/lib/inbound-routing.server");
  const replyTo = await mintReplyAddress(baseReplyTo, {
    workspaceId: input.workspaceId,
    sendingAccountId: account.id,
    leadId,
    purpose: "compose",
  });
  const send = await adapter.sendEmail(credentials ?? {}, {
    fromName: account.from_name,
    fromEmail: account.from_email,
    replyTo,
    to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.body,
    attachments: input.attachments,
  });
  if (!send.ok) throw new Error(send.message || "The email could not be delivered.");

  const nowIso = new Date().toISOString();
  const threadKey = buildThreadKey({ prospectEmail: to, subject: input.subject });

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: input.workspaceId,
        thread_key: threadKey,
        prospect_email: to,
        lead_id: leadId,
        sending_account_id: account.id,
        subject: input.subject,
        last_message_at: nowIso,
        last_direction: "outbound",
        last_preview: previewOf(input.body),
        unread: false,
        archived: false,
      },
      { onConflict: "workspace_id,thread_key" },
    )
    .select("id, message_count")
    .single();
  if (convError || !conversation) {
    throw new Error("The email was sent but the thread could not be saved. Refresh to confirm.");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("conversation_messages")
    .insert({
      conversation_id: conversation.id,
      workspace_id: input.workspaceId,
      direction: "outbound",
      from_email: account.from_email,
      from_name: account.from_name,
      to_email: to,
      cc_emails: input.cc,
      bcc_emails: input.bcc,
      subject: input.subject,
      body: input.body,
      message_id: stripAngle(send.messageId ?? null),
      reference_ids: [],
      sending_account_id: account.id,
      provider_message_id: send.messageId ?? null,
      attachments: input.attachments,
      delivery_status: "sent",
      occurred_at: nowIso,
    })
    .select("id")
    .single();
  if (insertError) {
    throw new Error("The email was sent but could not be saved. Refresh to confirm.");
  }

  await supabase
    .from("conversations")
    .update({ message_count: (conversation.message_count ?? 0) + 1 })
    .eq("id", conversation.id);

  await supabase.from("conversation_events").insert({
    conversation_id: conversation.id,
    workspace_id: input.workspaceId,
    type: "email_sent",
    detail: `Email sent from ${account.from_email}`,
    actor_id: input.userId,
  });

  await supabase
    .from("sending_accounts")
    .update({ sent_today: (account.sent_today ?? 0) + 1 })
    .eq("id", account.id);

  if (leadId) {
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      workspace_id: input.workspaceId,
      type: "email_sent",
      detail: `Manual email sent from ${account.from_email}`,
    });
    await supabase.from("leads").update({ last_activity_at: nowIso }).eq("id", leadId);
  }

  return { ok: true, conversationId: conversation.id, messageId: inserted.id };
}
