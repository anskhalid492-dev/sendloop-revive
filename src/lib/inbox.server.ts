/**
 * Inbound email processing for the Unified Inbox.
 *
 * This is the single place where a received email becomes a conversation
 * message. It is deliberately idempotent: the same email delivered twice (a
 * webhook retry, a duplicate provider event) resolves to the same conversation
 * and the same message row, and never fires the follow-up automation twice.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildThreadKey,
  classifyInbound,
  previewOf,
  stripAngle,
  type ConversationStatus,
} from "@/lib/inbox-model";

export type InboundEmail = {
  from: string;
  fromName?: string | null;
  to: string;
  cc?: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  receivedAt?: string | null;
  attachments?: { name: string; url?: string | undefined; size?: number | undefined }[];
};

export type IngestResult = {
  status: "created" | "duplicate" | "unmatched";
  conversationId?: string;
  messageId?: string;
  reason?: string;
};

type Db = typeof supabaseAdmin;

function lower(value: string): string {
  return value.trim().toLowerCase();
}

async function findCampaignMessage(db: Db, email: InboundEmail, prospect: string) {
  const candidates = [stripAngle(email.inReplyTo), ...(email.references ?? []).map(stripAngle)]
    .filter(Boolean)
    .slice(0, 20) as string[];

  if (candidates.length) {
    const { data } = await db
      .from("campaign_messages")
      .select("id, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, subject, to_email")
      .in("provider_message_id", candidates)
      .limit(1);
    if (data?.[0]) return data[0];
  }

  // No usable threading headers: fall back to the most recent email actually
  // sent to this prospect from this mailbox address.
  const { data: fallback } = await db
    .from("campaign_messages")
    .select("id, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, subject, to_email")
    .eq("to_email", prospect)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1);
  return fallback?.[0] ?? null;
}

async function resolveWorkspaceFromMailbox(db: Db, mailbox: string) {
  const { data } = await db
    .from("sending_accounts")
    .select("id, workspace_id")
    .or(`from_email.eq.${mailbox},reply_to.eq.${mailbox}`)
    .not("workspace_id", "is", null)
    .limit(1);
  return data?.[0] ?? null;
}

/** Processes one inbound email end to end. Safe to call repeatedly. */
export async function ingestInboundEmail(email: InboundEmail): Promise<IngestResult> {
  const db = supabaseAdmin;
  const prospect = lower(email.from);
  const mailbox = lower(email.to);
  if (!prospect || !mailbox) return { status: "unmatched", reason: "Missing sender or recipient" };

  const subject = (email.subject ?? "").slice(0, 300);
  const body = (email.text ?? previewOf(email.html, 20000) ?? "").slice(0, 100000);
  const receivedAt = email.receivedAt ? new Date(email.receivedAt) : new Date();
  const receivedIso = Number.isNaN(receivedAt.getTime())
    ? new Date().toISOString()
    : receivedAt.toISOString();
  const messageId = stripAngle(email.messageId);

  // Strongest signal first: the routed reply address we sent from.
  const { resolveRouteFromAddress } = await import("@/lib/inbound-routing.server");
  const route = await resolveRouteFromAddress(mailbox);

  const campaignMessage = await findCampaignMessage(db, email, prospect);
  let workspaceId = route?.workspace_id ?? campaignMessage?.workspace_id ?? null;
  let sendingAccountId =
    route?.sending_account_id ?? campaignMessage?.sending_account_id ?? null;

  if (!workspaceId) {
    const account = await resolveWorkspaceFromMailbox(db, mailbox);
    if (account) {
      workspaceId = account.workspace_id;
      sendingAccountId = sendingAccountId ?? account.id;
    }
  }
  if (!workspaceId) return { status: "unmatched", reason: "No workspace matched this email" };

  // Duplicate delivery of the very same email: stop before any side effect.
  if (messageId) {
    const { data: existing } = await db
      .from("conversation_messages")
      .select("id, conversation_id")
      .eq("workspace_id", workspaceId)
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      return { status: "duplicate", conversationId: existing.conversation_id, messageId: existing.id };
    }
  }

  let leadId = route?.lead_id ?? campaignMessage?.lead_id ?? null;
  if (!leadId) {
    const { data: lead } = await db
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", prospect)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  const campaignId = route?.campaign_id ?? campaignMessage?.campaign_id ?? null;
  const threadKey = buildThreadKey({ campaignId, prospectEmail: prospect, subject });

  // The routing token can point at an exact thread (manual compose, replies),
  // which beats subject-based thread keys.
  let routedConversation: { id: string; status: string; message_count: number } | null = null;
  if (route?.conversation_id) {
    const { data } = await db
      .from("conversations")
      .select("id, status, message_count, archived")
      .eq("id", route.conversation_id)
      .maybeSingle();
    routedConversation = (data as typeof routedConversation) ?? null;
  }

  const { data: upserted, error: convError } = routedConversation
    ? { data: routedConversation, error: null }
    : await db
    .from("conversations")
    .upsert(
      {
        workspace_id: workspaceId,
        thread_key: threadKey,
        prospect_email: prospect,
        lead_id: leadId,
        campaign_id: campaignId,
        sending_account_id: sendingAccountId,
        subject: subject || campaignMessage?.subject || "(no subject)",
      },
      { onConflict: "workspace_id,thread_key", ignoreDuplicates: false },
    )
    .select("id, status, message_count, archived")
    .single();
  const conversation = upserted;
  if (convError || !conversation) {
    return { status: "unmatched", reason: convError?.message ?? "Conversation not created" };
  }

  const { data: inserted, error: insertError } = await db
    .from("conversation_messages")
    .insert({
      conversation_id: conversation.id,
      workspace_id: workspaceId,
      direction: "inbound",
      from_email: prospect,
      from_name: email.fromName ?? null,
      to_email: mailbox,
      cc_emails: email.cc ?? [],
      subject,
      body,
      html: email.html ?? null,
      message_id: messageId,
      in_reply_to: stripAngle(email.inReplyTo),
      reference_ids: (email.references ?? []).map((r) => stripAngle(r)).filter(Boolean) as string[],
      campaign_message_id: campaignMessage?.id ?? null,
      sending_account_id: sendingAccountId,
      attachments: email.attachments ?? [],
      occurred_at: receivedIso,
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation = concurrent duplicate delivery; treat as already done.
    if (insertError.code === "23505") return { status: "duplicate", conversationId: conversation.id };
    return { status: "unmatched", reason: insertError.message };
  }

  const detected: ConversationStatus | null = classifyInbound(subject, body);
  const nextStatus =
    conversation.status === "lead" && detected ? detected : (conversation.status as string);

  await db
    .from("conversations")
    .update({
      unread: true,
      archived: false,
      snoozed_until: null,
      status: nextStatus,
      message_count: (conversation.message_count ?? 0) + 1,
      last_message_at: receivedIso,
      last_direction: "inbound",
      last_preview: previewOf(body),
      lead_id: leadId,
      campaign_id: campaignId,
      sending_account_id: sendingAccountId,
    })
    .eq("id", conversation.id);

  await db.from("conversation_events").insert({
    conversation_id: conversation.id,
    workspace_id: workspaceId,
    type: "reply_received",
    detail: `Reply from ${prospect}`,
    dedupe_key: messageId ? `reply:${messageId}` : null,
  });

  await applyReplyAutomation({
    db,
    workspaceId,
    conversationId: conversation.id,
    leadId,
    campaignId,
    campaignMessage,
    prospect,
    subject,
    detected,
    receivedIso,
    dedupeKey: messageId ?? inserted.id,
  });

  return { status: "created", conversationId: conversation.id, messageId: inserted.id };
}

/** Lead status, activity, follow-up stop and notifications for a fresh reply. */
async function applyReplyAutomation(args: {
  db: Db;
  workspaceId: string;
  conversationId: string;
  leadId: string | null;
  campaignId: string | null;
  campaignMessage: { id: string; recipient_id: string | null } | null;
  prospect: string;
  subject: string;
  detected: ConversationStatus | null;
  receivedIso: string;
  dedupeKey: string;
}) {
  const { db, workspaceId, conversationId, leadId, campaignId, campaignMessage } = args;

  const leadStatus =
    args.detected === "bounced"
      ? "bounced"
      : args.detected === "unsubscribed"
        ? "unsubscribed"
        : args.detected === "not_interested"
          ? "not_interested"
          : args.detected === "interested"
            ? "interested"
            : "replied";

  if (leadId) {
    await db
      .from("leads")
      .update({ status: leadStatus, last_activity_at: args.receivedIso })
      .eq("id", leadId);

    await db.from("lead_activities").insert({
      lead_id: leadId,
      workspace_id: workspaceId,
      campaign_id: campaignId,
      type: "replied",
      detail: `Reply from ${args.prospect}${args.subject ? ` — ${args.subject}` : ""}`,
      created_at: args.receivedIso,
    });
  }

  let stopOnReply = true;
  if (campaignId) {
    const { data: campaign } = await db
      .from("campaigns")
      .select("stop_on_reply, name")
      .eq("id", campaignId)
      .maybeSingle();
    stopOnReply = campaign?.stop_on_reply ?? true;
  }

  if (campaignId && leadId) {
    await db
      .from("campaign_recipients")
      .update({ status: "replied", ...(stopOnReply ? { next_send_at: null } : {}) })
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId);

    if (stopOnReply) {
      await db
        .from("campaign_messages")
        .update({ status: "cancelled" })
        .eq("campaign_id", campaignId)
        .eq("lead_id", leadId)
        .in("status", ["pending", "scheduled"]);
    }
  }

  // Mirror into the existing campaign reply log so the queue tab keeps working.
  if (campaignMessage?.id && leadId && campaignId) {
    await db.from("campaign_replies").insert({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      message_id: campaignMessage.id,
      lead_id: leadId,
      from_email: args.prospect,
      subject: args.subject || null,
      sentiment:
        args.detected === "interested"
          ? "positive"
          : args.detected === "not_interested"
            ? "negative"
            : args.detected === "ooo"
              ? "out_of_office"
              : "neutral",
      received_at: args.receivedIso,
    });
  }

  // One notification per workspace member, deduplicated by the source email.
  const { data: members } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const rows = (members ?? []).map((m) => ({
    user_id: m.user_id,
    workspace_id: workspaceId,
    type: "reply",
    title: `New reply from ${args.prospect}`,
    message: args.subject || null,
    entity_type: "conversation",
    entity_id: conversationId,
  }));
  if (rows.length) await db.from("notifications").insert(rows);
}

/**
 * Mirrors a campaign send into the Unified Inbox so the thread already exists
 * when the prospect replies. Idempotent per campaign message.
 */
export async function recordOutboundCampaignMessage(args: {
  workspaceId: string;
  campaignId: string;
  leadId: string | null;
  campaignMessageId: string;
  sendingAccountId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  body: string;
  providerMessageId: string | null;
  sentAt: string;
}) {
  const db = supabaseAdmin;
  const prospect = lower(args.toEmail);
  const threadKey = buildThreadKey({
    campaignId: args.campaignId,
    prospectEmail: prospect,
    subject: args.subject,
  });

  const { data: existing } = await db
    .from("conversation_messages")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("campaign_message_id", args.campaignMessageId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: conversation } = await db
    .from("conversations")
    .upsert(
      {
        workspace_id: args.workspaceId,
        thread_key: threadKey,
        prospect_email: prospect,
        lead_id: args.leadId,
        campaign_id: args.campaignId,
        sending_account_id: args.sendingAccountId,
        subject: args.subject,
      },
      { onConflict: "workspace_id,thread_key" },
    )
    .select("id, message_count")
    .single();
  if (!conversation) return null;

  const { data: inserted } = await db
    .from("conversation_messages")
    .insert({
      conversation_id: conversation.id,
      workspace_id: args.workspaceId,
      direction: "outbound",
      from_email: lower(args.fromEmail),
      from_name: args.fromName,
      to_email: prospect,
      subject: args.subject,
      body: args.body,
      message_id: stripAngle(args.providerMessageId),
      campaign_message_id: args.campaignMessageId,
      sending_account_id: args.sendingAccountId,
      provider_message_id: args.providerMessageId,
      occurred_at: args.sentAt,
    })
    .select("id")
    .single();

  await db
    .from("conversations")
    .update({
      message_count: (conversation.message_count ?? 0) + 1,
      last_message_at: args.sentAt,
      last_direction: "outbound",
      last_preview: previewOf(args.body),
      sending_account_id: args.sendingAccountId,
    })
    .eq("id", conversation.id);

  return inserted?.id ?? null;
}
