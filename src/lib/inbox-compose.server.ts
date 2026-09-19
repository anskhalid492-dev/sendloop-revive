/**
 * Composing a brand new email from the Unified Inbox.
 *
 * The customer picks one of their assigned mailboxes; credentials are resolved
 * server-side and never leave this module. A successful send creates (or
 * reuses) the conversation thread so the reply lands in the same place.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OutboundAttachment } from "@/lib/mail-attachments";
import { buildThreadKey, previewOf, stripAngle } from "@/lib/inbox-model";
import { mailboxWindowStart, nextStoredSentToday } from "@/lib/mailbox-daily-usage";

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
  attachments: OutboundAttachment[];
};

export async function composeAndSend(input: ComposeInput) {
  const supabase = input.supabase;

  const to = input.to.trim().toLowerCase();

  const { data: account, error: accountError } = await supabase
    .from("sending_accounts")
    .select(
      "id, label, provider, provider_id, from_name, from_email, reply_to, paused, customer_enabled, status, sent_today, daily_limit, hourly_limit, last_sent_at, workspace_id",
    )
    .eq("id", input.sendingAccountId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account || account.workspace_id !== input.workspaceId) {
    throw new Error("That mailbox is not available in this workspace.");
  }
  // Authoritative capacity check immediately before handing off to the
  // provider: same mailbox daily/hourly limits, no bypass, no stale counts.
  const { assertMailboxCapacity } = await import("@/lib/mailbox-capacity.server");
  await assertMailboxCapacity(account, "reply");

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

  // Locked down exactly like campaign dispatch and inbox replies: a composed
  // email may only leave through a mailbox the customer connected themselves
  // (SMTP via mailbox-smtp-relay). No shared platform credentials, ever.
  const { findCustomerMailbox, sendViaCustomerMailbox } = await import(
    "@/lib/customer-mailbox-send.server"
  );
  const customerMailbox = await findCustomerMailbox(
    supabaseAdmin,
    input.workspaceId,
    account.from_email as string,
  );
  if (!customerMailbox) {
    const { isMailboxPaused, PAUSED_MAILBOX_MESSAGE } = await import("@/lib/mailbox-active.server");
    const paused = await isMailboxPaused(
      supabaseAdmin,
      input.workspaceId,
      account.from_email as string,
    );
    console.warn(
      `[inbox-compose] refused: ${paused ? "mailbox paused" : "no connected customer mailbox"} for ${account.from_email} (workspace ${input.workspaceId}).`,
    );
    throw new Error(
      paused
        ? PAUSED_MAILBOX_MESSAGE
        : "This mailbox is not connected with your own email credentials yet. Connect it under Email Accounts, then send this email again.",
    );
  }
  const { assertAttachmentsWithinLimit, relayAttachments } = await import(
    "@/lib/mail-attachments"
  );
  assertAttachmentsWithinLimit(input.attachments);

  // A tracked reply address is a nice-to-have here: replies to a mailbox the
  // customer owns are picked up from that mailbox directly.
  const { mintReplyRoute } = await import("@/lib/inbound-routing.server");
  const replyRoute = await mintReplyRoute(account.from_email, {
    workspaceId: input.workspaceId,
    sendingAccountId: account.id,
    leadId,
    purpose: "compose",
  });
  const { createOutboundRfcMessageId, mergeEmailHeaders } = await import(
    "@/lib/outbound-threading.server"
  );
  const outboundMessageId = createOutboundRfcMessageId(account.from_email);
  // Cc is a visible header so every Cc recipient sees the others. Bcc is
  // deliberately absent from the headers — it only exists on the envelope.
  const headers = mergeEmailHeaders({
    ...(replyRoute?.visibleAddress ? { "Reply-To": replyRoute.visibleAddress } : {}),
    ...(input.cc.length ? { Cc: input.cc.join(", ") } : {}),
  });

  // The stored row's id is minted here so the open-tracking pixel can point at
  // this exact message before it is sent.
  const { randomUUID } = await import("crypto");
  const outboundRowId = randomUUID();
  const { campaignBodyHtml } = await import("@/lib/email-html");
  const { applyEmailTracking } = await import("@/lib/email-tracking");
  // Mailbox signature, resolved server-side from the mailbox this email leaves
  // through — the same shared composition layer campaigns and replies use.
  const { resolveSignatureForSender } = await import("@/lib/signatures.server");
  const { applySignatureToText, signatureHtmlSource, injectSignatureHtml, clearSignatureToken } =
    await import("@/lib/signature-model");
  const composeSignature = await resolveSignatureForSender(
    supabaseAdmin,
    input.workspaceId,
    account.from_email as string,
    account.from_name as string | null,
  );
  const composedBody = applySignatureToText(input.body, composeSignature?.text ?? null);
  const composeHtmlSource = composeSignature
    ? signatureHtmlSource(input.body)
    : clearSignatureToken(input.body);
  // Same shared tracking step as campaign dispatch and inbox replies.
  const composeHtml = injectSignatureHtml(
    applyEmailTracking(campaignBodyHtml(composeHtmlSource), {
    target: {
      workspaceId: input.workspaceId,
      messageKind: "conversation",
      messageId: outboundRowId,
      leadId,
      email: to,
    },
      trackOpens: true,
      trackClicks: true,
    }),
    composeSignature?.html ?? null,
  );


  // ONE message, delivered to every recipient: To + Cc + Bcc on the envelope.
  // (Campaign sending keeps its per-lead loop — that separation is intentional.)
  const send = await sendViaCustomerMailbox(supabaseAdmin, customerMailbox, {
    to,
    envelopeTo: [to, ...input.cc, ...input.bcc],
    subject: input.subject,
    text: composedBody,
    html: composeHtml,
    fromName: account.from_name,
    headers,
    attachments: relayAttachments(input.attachments),
  });
  if (!send.ok) throw new Error(send.message || "The email could not be delivered.");
  // A copy of each file is kept in private storage so the thread view can offer
  // it for download later; the archive record still carries name, type and size.
  const { storeOutboundAttachments } = await import("@/lib/mail-attachment-store.server");
  const archived = await storeOutboundAttachments({
    workspaceId: input.workspaceId,
    attachments: input.attachments,
  });



  const nowIso = new Date().toISOString();
  const legacyThreadKey = buildThreadKey({ prospectEmail: to, subject: input.subject });
  const threadKey = buildThreadKey({
    prospectEmail: to,
    subject: input.subject,
    sendingAccountId: account.id,
  });

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id, message_count")
    .eq("workspace_id", input.workspaceId)
    .eq("prospect_email", to)
    .eq("sending_account_id", account.id)
    .in("thread_key", [threadKey, legacyThreadKey])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conversationWrite = {
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
  };

  const { data: conversation, error: convError } = existingConversation
    ? await supabase
        .from("conversations")
        .update({
          lead_id: leadId,
          subject: input.subject,
          last_message_at: nowIso,
          last_direction: "outbound",
          last_preview: previewOf(input.body),
          unread: false,
          archived: false,
        })
        .eq("id", existingConversation.id)
        .select("id, message_count")
        .single()
    : await supabase
        .from("conversations")
        .upsert(conversationWrite, { onConflict: "workspace_id,thread_key" })
        .select("id, message_count")
        .single();
  if (convError || !conversation) {
    throw new Error("The email was sent but the thread could not be saved. Refresh to confirm.");
  }
  try {
    if (replyRoute?.id) {
      await supabaseAdmin
        .from("inbound_routes")
        .update({ conversation_id: conversation.id })
        .eq("id", replyRoute!.id)
        .is("conversation_id", null);
    }
  } catch {
    /* Reply headers still thread this message if route backfill fails. */
  }

  const { data: inserted, error: insertError } = await supabase
    .from("conversation_messages")
    .insert({
      id: outboundRowId,
      conversation_id: conversation.id,
      workspace_id: input.workspaceId,
      direction: "outbound",
      from_email: account.from_email,
      from_name: account.from_name,
      to_email: to,
      cc_emails: input.cc,
      bcc_emails: input.bcc,
      subject: input.subject,
      body: composedBody,
      message_id: stripAngle(outboundMessageId),
      reference_ids: [],
      sending_account_id: account.id,
      provider_message_id: send.messageId ?? null,
      attachments: archived,
      delivery_status: "sent",
      occurred_at: nowIso,
    })
    .select("id")
    .single();
  if (insertError) {
    throw new Error("The email was sent but could not be saved. Refresh to confirm.");
  }

  try {
    const { registerOutboundMessage } = await import("@/lib/message-classification.server");
    await registerOutboundMessage({
      providerMessageId: send.messageId ?? null,
      messageType: "manual_reply",
      provider: account.provider,
      workspaceId: input.workspaceId,
      sendingAccountId: account.id,
      toEmail: to,
      refTable: "conversation_messages",
      refId: inserted.id,
      alternateProviderMessageIds: [outboundMessageId],
    });
  } catch {
    /* classification must never fail an already delivered send */
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
    .update({
      sent_today: nextStoredSentToday(account, mailboxWindowStart(), 1),
      last_sent_at: new Date().toISOString(),
    })
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
