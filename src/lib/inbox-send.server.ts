/**
 * Sending a reply from the Unified Inbox.
 *
 * The customer only ever references their assigned mailbox; provider
 * credentials are read server-side with the service client and never leave
 * this module.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { previewOf, stripAngle } from "@/lib/inbox-model";
import type { OutboundAttachment } from "@/lib/mail-attachments";

import { mailboxWindowStart, nextStoredSentToday } from "@/lib/mailbox-daily-usage";

type AnyClient = {
  from: (table: string) => any;
};

export async function resolveReplyTo(providerId: string | null, fallback: string | null) {
  if (providerId) {
    const { data } = await supabaseAdmin
      .from("email_providers")
      .select("reply_to_email")
      .eq("id", providerId)
      .maybeSingle();
    if (data?.reply_to_email) return data.reply_to_email;
  }
  const { data: setting } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "reply_to")
    .maybeSingle();
  const value = (setting?.value ?? {}) as { email?: string };
  return value.email || fallback || null;
}

export async function sendReplyThroughMailbox(args: {
  supabase: AnyClient;
  userId: string;
  conversationId: string;
  subject: string;
  body: string;
  /** Optional formatted body from the composer (bold/italic/underline/links). */
  bodyHtml?: string | null;
  cc: string[];
  attachments: OutboundAttachment[];
}) {
  const supabase = args.supabase;

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(
      "id, workspace_id, prospect_email, sending_account_id, campaign_id, lead_id, message_count",
    )
    .eq("id", args.conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conversation) throw new Error("Conversation not found");

  // RLS above proved workspace membership; the mailbox read is scoped to the
  // same workspace so a customer can only send from their own accounts.
  const { data: account } = await supabase
    .from("sending_accounts")
    .select(
      "id, label, provider, provider_id, from_name, from_email, reply_to, paused, customer_enabled, status, sent_today, daily_limit, hourly_limit, last_sent_at, workspace_id",
    )
    .eq("id", conversation.sending_account_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();

  if (!account || account.workspace_id !== conversation.workspace_id) {
    throw new Error("No sending mailbox is linked to this conversation yet.");
  }
  // Human replies use the reply lane: real safety states (paused/disabled) and
  // the provider still apply, but MunchReach's own campaign pacing limits never
  // stop a customer from answering a prospect.
  const { assertMailboxCapacity } = await import("@/lib/mailbox-capacity.server");
  await assertMailboxCapacity(account, "reply");

  // Idempotency: a double click or a refresh-and-resend must not deliver the
  // same reply twice. An identical outbound message in the last two minutes is
  // treated as the same send.
  const { data: recent } = await supabase
    .from("conversation_messages")
    .select("id, subject, body, occurred_at")
    .eq("conversation_id", conversation.id)
    .eq("direction", "outbound")
    .gte("occurred_at", new Date(Date.now() - 120_000).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(5);
  const duplicate = ((recent ?? []) as { id: string; subject: string | null; body: string | null }[]).find(
    (m) => (m.subject ?? "") === args.subject && (m.body ?? "") === args.body,
  );
  if (duplicate) return { ok: true, messageId: duplicate.id, duplicate: true };



  // Server-side variable resolution. Templates picked in the composer are
  // already personalised client-side; this second pass is the guarantee that a
  // raw {{token}} can never reach a prospect (stale draft, API caller, etc.).
  // It uses the same renderer as Campaigns/Sequences.
  const { renderEmailForLead, senderExtras } = await import("@/lib/campaign-model");
  const { data: replyLead } = conversation.lead_id
    ? await supabase
        .from("leads")
        .select(
          "id, email, first_name, last_name, company, job_title, phone, website, linkedin_url, city, state, country, custom_fields",
        )
        .eq("id", conversation.lead_id)
        .maybeSingle()
    : { data: null };

  const rendered = renderEmailForLead(
    { subject: args.subject, body: args.body },
    (replyLead ?? { email: conversation.prospect_email }) as never,
    { extras: senderExtras(account) },
  );
  const subject = rendered.subject.trim() || args.subject;
  // Mailbox signature for the mailbox this reply actually leaves through. It is
  // appended to the newly typed reply only — the quoted history the reply
  // system adds later is never touched, and a retried send rebuilds the same
  // single signature.
  const { resolveSignatureForSender } = await import("@/lib/signatures.server");
  const { applySignatureToText, signatureHtmlSource, injectSignatureHtml, clearSignatureToken } =
    await import("@/lib/signature-model");
  const replySignature = await resolveSignatureForSender(
    supabaseAdmin,
    conversation.workspace_id as string,
    account.from_email as string,
    account.from_name as string | null,
  );
  const body = applySignatureToText(rendered.body, replySignature?.text ?? null);
  // A formatted reply carries its own HTML through the same signature and
  // tracking steps; a plain reply keeps the existing text-to-HTML rendering.
  const { sanitizeComposerHtml } = await import("@/lib/rich-text");
  const richSource = args.bodyHtml
    ? sanitizeComposerHtml(
        renderEmailForLead(
          { subject: args.subject, body: args.bodyHtml },
          (replyLead ?? { email: conversation.prospect_email }) as never,
          { extras: senderExtras(account) },
        ).body,
      )
    : "";
  const htmlBodySource = richSource || rendered.body;
  const replyHtmlSource = replySignature
    ? signatureHtmlSource(htmlBodySource)
    : clearSignatureToken(htmlBodySource);

  const { data: lastInbound } = await supabase
    .from("conversation_messages")
    .select("message_id, reference_ids")
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { isSuppressed } = await import("@/lib/suppression.server");
  const blocked = await isSuppressed(conversation.workspace_id, conversation.prospect_email);
  if (blocked) {
    throw new Error(`This contact is on your suppression list (${blocked}) and cannot be emailed.`);
  }

  const { mintCleanReplyAddress } = await import("@/lib/inbound-routing.server");
  const replyTo = await mintCleanReplyAddress(account.from_email, {
    workspaceId: conversation.workspace_id,
    sendingAccountId: account.id,
    leadId: conversation.lead_id,
    campaignId: conversation.campaign_id,
    conversationId: conversation.id,
    purpose: "reply",
  });
  const parentId = (lastInbound?.message_id as string | undefined) ?? null;
  const threadRefs = [
    ...((lastInbound?.reference_ids ?? []) as string[]),
    ...(parentId ? [parentId] : []),
  ].slice(-20);
  const { createOutboundRfcMessageId, mergeEmailHeaders } = await import(
    "@/lib/outbound-threading.server"
  );
  const outboundMessageId = createOutboundRfcMessageId(account.from_email);

  // Locked down exactly like campaign dispatch: a reply may only leave through a
  // mailbox the customer connected themselves (SMTP/IMAP, via mailbox-smtp-relay).
  // No fallback to shared platform credentials.
  const { findCustomerMailbox, sendViaCustomerMailbox } = await import(
    "@/lib/customer-mailbox-send.server"
  );
  const customerMailbox = await findCustomerMailbox(
    supabaseAdmin,
    conversation.workspace_id as string,
    account.from_email as string,
  );
  if (!customerMailbox) {
    const { isMailboxPaused, PAUSED_MAILBOX_MESSAGE } = await import(
      "@/lib/mailbox-active.server"
    );
    const paused = await isMailboxPaused(
      supabaseAdmin,
      conversation.workspace_id as string,
      account.from_email as string,
    );
    console.warn(
      `[inbox-reply] refused: ${paused ? "mailbox paused" : "no connected customer mailbox"} for ${account.from_email} (workspace ${conversation.workspace_id}).`,
    );
    throw new Error(
      paused
        ? PAUSED_MAILBOX_MESSAGE
        : "This conversation's mailbox is not connected with your own email credentials yet. Reconnect it under Email Accounts, then send this reply again.",
    );
  }
  const { assertAttachmentsWithinLimit, relayAttachments } = await import(
    "@/lib/mail-attachments"
  );
  assertAttachmentsWithinLimit(args.attachments);
  // Same as Compose: a private copy is kept so the file stays downloadable.
  const { storeOutboundAttachments } = await import("@/lib/mail-attachment-store.server");
  const archivedReplyAttachments = await storeOutboundAttachments({
    workspaceId: conversation.workspace_id as string,
    attachments: args.attachments,
  });

  const replyHeaders = mergeEmailHeaders({
    ...(replyTo ? { "Reply-To": replyTo } : {}),
    ...(args.cc.length ? { Cc: args.cc.join(", ") } : {}),
    ...(parentId
      ? {
          "In-Reply-To": `<${parentId}>`,
          References: threadRefs.map((id) => `<${id}>`).join(" "),
        }
      : {}),
  });

  // The stored row's id is minted here so the open-tracking pixel can point at
  // this exact reply before it is sent.
  const { randomUUID } = await import("crypto");
  const outboundRowId = randomUUID();
  const { campaignBodyHtml, richBodyHtml } = await import("@/lib/email-html");
  const { applyEmailTracking } = await import("@/lib/email-tracking");
  // Same shared tracking step as campaign dispatch and Compose.
  const replyHtml = injectSignatureHtml(
    applyEmailTracking(
      richSource ? richBodyHtml(replyHtmlSource) : campaignBodyHtml(replyHtmlSource),
      {
    target: {
      workspaceId: conversation.workspace_id as string,
      messageKind: "conversation",
      messageId: outboundRowId,
      campaignId: (conversation.campaign_id as string | null) ?? null,
      leadId: (conversation.lead_id as string | null) ?? null,
      email: conversation.prospect_email as string,
    },
      trackOpens: true,
      trackClicks: true,
    },
    ),
    replySignature?.html ?? null,
  );


  // ONE message: the prospect on To, any Cc addresses visible to each other,
  // all of them delivery targets on the same envelope.
  const send = await sendViaCustomerMailbox(supabaseAdmin, customerMailbox, {
    to: conversation.prospect_email as string,
    envelopeTo: [conversation.prospect_email as string, ...args.cc],
    subject,
    text: body,
    html: replyHtml,
    fromName: account.from_name,
    headers: replyHeaders,
    attachments: relayAttachments(args.attachments),
  });
  if (!send.ok) {
    throw new Error(send.message || "The reply could not be delivered. Please try again.");
  }


  const nowIso = new Date().toISOString();
  const references = [
    ...((lastInbound?.reference_ids ?? []) as string[]),
    ...(lastInbound?.message_id ? [lastInbound.message_id as string] : []),
  ].slice(-20);

  const { data: inserted, error: insertError } = await supabase
    .from("conversation_messages")
    .insert({
      id: outboundRowId,
      conversation_id: conversation.id,
      workspace_id: conversation.workspace_id,
      direction: "outbound",
      from_email: account.from_email,
      from_name: account.from_name,
      to_email: conversation.prospect_email,
      cc_emails: args.cc,
      subject: subject,
      body: body,
      // The formatted version is stored so the thread shows what was sent.
      html: richSource || null,
      message_id: stripAngle(outboundMessageId),
      in_reply_to: (lastInbound?.message_id as string | undefined) ?? null,
      reference_ids: references,
      sending_account_id: account.id,
      provider_message_id: send.messageId ?? null,
      attachments: archivedReplyAttachments,
      occurred_at: nowIso,
    })
    .select("id")
    .single();
  if (insertError) throw new Error("The reply was sent but could not be saved. Refresh to confirm.");

  try {
    const { registerOutboundMessage } = await import("@/lib/message-classification.server");
    await registerOutboundMessage({
      providerMessageId: send.messageId ?? null,
      messageType: "manual_reply",
      provider: account.provider,
      workspaceId: conversation.workspace_id,
      sendingAccountId: account.id,
      toEmail: conversation.prospect_email,
      refTable: "conversation_messages",
      refId: inserted.id,
      alternateProviderMessageIds: [outboundMessageId],
    });
  } catch {
    /* classification must never fail an already delivered send */
  }

  await supabase
    .from("conversations")
    .update({
      unread: false,
      archived: false,
      snoozed_until: null,
      message_count: (conversation.message_count ?? 0) + 1,
      last_message_at: nowIso,
      last_direction: "outbound",
      last_preview: previewOf(body),
    })
    .eq("id", conversation.id);

  await supabase.from("conversation_events").insert({
    conversation_id: conversation.id,
    workspace_id: conversation.workspace_id,
    type: "reply_sent",
    detail: `Reply sent from ${account.from_email}`,
    actor_id: args.userId,
  });

  await supabase
    .from("sending_accounts")
    .update({
      // Date-aware + clamped: a counter from a previous day restarts at 0 today
      // and can never be pushed above the mailbox's own daily limit.
      sent_today: nextStoredSentToday(account, mailboxWindowStart(), 1),
      last_sent_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  if (conversation.lead_id) {
    await supabase.from("lead_activities").insert({
      lead_id: conversation.lead_id,
      workspace_id: conversation.workspace_id,
      campaign_id: conversation.campaign_id,
      type: "email_sent",
      detail: `Manual reply sent from ${account.from_email}`,
    });
    await supabase
      .from("leads")
      .update({ last_activity_at: nowIso })
      .eq("id", conversation.lead_id);
  }

  return { ok: true, messageId: inserted.id };
}
