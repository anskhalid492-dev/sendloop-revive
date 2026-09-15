/**
 * Sending a reply from the Unified Inbox.
 *
 * The customer only ever references their assigned mailbox; provider
 * credentials are read server-side with the service client and never leave
 * this module.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { previewOf, stripAngle } from "@/lib/inbox-model";
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
  cc: string[];
  attachments: { name: string; url: string }[];
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
  const body = rendered.body;

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
  const { createOutboundRfcMessageId, mergeEmailHeaders, messageIdHeader } = await import(
    "@/lib/outbound-threading.server"
  );
  const outboundMessageId = createOutboundRfcMessageId(account.from_email);

  // Managed sending: MunchReach-owned credentials + provider-side domain check.
  const { sendManagedEmail } = await import("@/lib/managed-sending.server");
  const send = await sendManagedEmail(
    supabaseAdmin,
    {
      id: account.id as string,
      workspace_id: conversation.workspace_id as string,
      provider: account.provider as string,
      provider_id: (account.provider_id as string | null) ?? null,
      from_email: account.from_email as string,
    },
    {
    fromName: account.from_name,
    fromEmail: account.from_email,
    replyTo,
    to: conversation.prospect_email,
    cc: args.cc,
    subject: subject,
    text: body,
    attachments: args.attachments,
    // Real RFC threading headers keep the prospect's mail client (and our own
    // ingestion) on the same conversation.
    headers: mergeEmailHeaders(
      parentId
        ? {
            "In-Reply-To": `<${parentId}>`,
            References: threadRefs.map((id) => `<${id}>`).join(" "),
          }
        : null,
    ),
    },
    { stage: "inbox" },
  );
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
      conversation_id: conversation.id,
      workspace_id: conversation.workspace_id,
      direction: "outbound",
      from_email: account.from_email,
      from_name: account.from_name,
      to_email: conversation.prospect_email,
      cc_emails: args.cc,
      subject: subject,
      body: body,
      message_id: stripAngle(send.rfcMessageId ?? outboundMessageId),
      in_reply_to: (lastInbound?.message_id as string | undefined) ?? null,
      reference_ids: references,
      sending_account_id: account.id,
      provider_message_id: send.messageId ?? null,
      attachments: args.attachments,
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
      alternateProviderMessageIds: [send.rfcMessageId ?? null, outboundMessageId],
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
