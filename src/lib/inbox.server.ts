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
  normalizeSubject,
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
  workspaceId?: string;
  leadId?: string | null;
  campaignId?: string | null;
  sendingAccountId?: string | null;
  reason?: string;
};

type Db = typeof supabaseAdmin;

function lower(value: string): string {
  return value.trim().toLowerCase();
}

/** `anus+tok@Domain.com` -> `anus@domain.com`, so plain replies match mailboxes. */
function baseAddress(value: string): string {
  const [rawLocal, rawDomain] = lower(value).split("@");
  const local = (rawLocal ?? "").split("+")[0] ?? "";
  return rawDomain ? `${local}@${rawDomain}` : local;
}

/** Every Message-ID this reply points at, newest reference first. */
function threadCandidates(email: InboundEmail): string[] {
  const ids = [stripAngle(email.inReplyTo), ...[...(email.references ?? [])].reverse().map(stripAngle)]
    .filter(Boolean)
    .map((id) => (id as string).trim());
  return Array.from(new Set(ids)).slice(0, 20);
}

function inList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;
}

const CAMPAIGN_MESSAGE_COLUMNS =
  "id, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, subject, to_email";

/**
 * Finds the outbound send this reply answers. Order: the Message-ID we stored
 * when sending (provider id or our own id), then the newest email actually
 * sent to this prospect from this mailbox. A routing token is never required.
 */
async function findCampaignMessage(
  db: Db,
  email: InboundEmail,
  prospect: string,
  mailboxWorkspaceId: string | null,
  mailboxAccountId: string | null,
) {
  const candidates = threadCandidates(email);

  if (candidates.length) {
    let registryQuery = db
      .from("outbound_messages")
      .select("ref_id")
      .eq("ref_table", "campaign_messages")
      .not("ref_id", "is", null)
      .in("provider_message_id", candidates)
      .limit(20);
    if (mailboxWorkspaceId) registryQuery = registryQuery.eq("workspace_id", mailboxWorkspaceId);
    if (mailboxAccountId) registryQuery = registryQuery.eq("sending_account_id", mailboxAccountId);
    const { data: registryRows } = await registryQuery;
    const registryIds = Array.from(
      new Set((registryRows ?? []).map((row: { ref_id: string | null }) => row.ref_id).filter(Boolean)),
    ) as string[];
    if (registryIds.length) {
      let linkedQuery = db
        .from("campaign_messages")
        .select(CAMPAIGN_MESSAGE_COLUMNS)
        .in("id", registryIds)
        .limit(1);
      if (mailboxWorkspaceId) linkedQuery = linkedQuery.eq("workspace_id", mailboxWorkspaceId);
      if (mailboxAccountId) linkedQuery = linkedQuery.eq("sending_account_id", mailboxAccountId);
      const { data: linkedByRegistry } = await linkedQuery;
      if (linkedByRegistry?.[0]) return linkedByRegistry[0];
    }

    const list = inList(candidates);
    let campaignQuery = db
      .from("campaign_messages")
      .select(CAMPAIGN_MESSAGE_COLUMNS)
      .or(`provider_message_id.in.${list}`)
      .limit(1);
    if (mailboxWorkspaceId) campaignQuery = campaignQuery.eq("workspace_id", mailboxWorkspaceId);
    if (mailboxAccountId) campaignQuery = campaignQuery.eq("sending_account_id", mailboxAccountId);
    const { data } = await campaignQuery;
    if (data?.[0]) return data[0];

    // The id may belong to a reply we sent from the inbox rather than a
    // campaign step: that row carries the campaign message it belongs to.
    let conversationQuery = db
      .from("conversation_messages")
      .select("campaign_message_id")
      .or(`message_id.in.${list},provider_message_id.in.${list}`)
      .not("campaign_message_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (mailboxWorkspaceId) conversationQuery = conversationQuery.eq("workspace_id", mailboxWorkspaceId);
    if (mailboxAccountId) conversationQuery = conversationQuery.eq("sending_account_id", mailboxAccountId);
    const { data: viaConversation } = await conversationQuery;
    const campaignMessageId = viaConversation?.[0]?.campaign_message_id as string | undefined;
    if (campaignMessageId) {
      const { data: linked } = await db
        .from("campaign_messages")
        .select(CAMPAIGN_MESSAGE_COLUMNS)
        .eq("id", campaignMessageId)
        .maybeSingle();
      if (linked) return linked;
    }
  }

  // No usable threading headers: fall back to the most recent email actually
  // sent to this prospect from the mailbox that received the reply. Never claim
  // a reply through a different workspace/default/first mailbox when we know the
  // recipient mailbox.
  let query = db
    .from("campaign_messages")
    .select(CAMPAIGN_MESSAGE_COLUMNS)
    .eq("to_email", prospect)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  if (mailboxWorkspaceId) query = query.eq("workspace_id", mailboxWorkspaceId);
  if (mailboxAccountId) query = query.eq("sending_account_id", mailboxAccountId);
  const { data: fallback } = await query;
  if (fallback?.[0]) return fallback[0];

  if (mailboxWorkspaceId && !mailboxAccountId) {
    const { data: anyWorkspace } = await db
      .from("campaign_messages")
      .select(CAMPAIGN_MESSAGE_COLUMNS)
      .eq("workspace_id", mailboxWorkspaceId)
      .eq("to_email", prospect)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    return anyWorkspace?.[0] ?? null;
  }
  return null;
}

type ConversationRef = { id: string; status: string; message_count: number };

async function loadConversation(db: Db, id: string): Promise<ConversationRef | null> {
  const { data } = await db
    .from("conversations")
    .select("id, status, message_count, archived")
    .eq("id", id)
    .maybeSingle();
  return (data as ConversationRef | null) ?? null;
}

/**
 * RFC threading: In-Reply-To / References point at a Message-ID we already
 * stored (campaign send or inbox reply). Matching those to the conversation is
 * the most reliable way to keep a reply on the same thread, and beats the
 * subject-derived thread key.
 */
async function findConversationByHeaders(
  db: Db,
  email: InboundEmail,
  workspaceId: string,
  sendingAccountId: string | null,
) {
  const candidates = threadCandidates(email);
  if (!candidates.length) return null;

  let registryQuery = db
    .from("outbound_messages")
    .select("ref_id")
    .eq("ref_table", "conversation_messages")
    .not("ref_id", "is", null)
    .in("provider_message_id", candidates)
    .limit(20);
  if (workspaceId) registryQuery = registryQuery.eq("workspace_id", workspaceId);
  if (sendingAccountId) registryQuery = registryQuery.eq("sending_account_id", sendingAccountId);
  const { data: registryRows } = await registryQuery;
  const registryIds = Array.from(
    new Set((registryRows ?? []).map((row: { ref_id: string | null }) => row.ref_id).filter(Boolean)),
  ) as string[];
  if (registryIds.length) {
    let messageQuery = db
      .from("conversation_messages")
      .select("conversation_id")
      .eq("workspace_id", workspaceId)
      .in("id", registryIds)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (sendingAccountId) messageQuery = messageQuery.eq("sending_account_id", sendingAccountId);
    const { data: byRegistry } = await messageQuery;
    const registryConversationId = byRegistry?.[0]?.conversation_id as string | undefined;
    if (registryConversationId) return loadConversation(db, registryConversationId);
  }

  const list = inList(candidates);
  let query = db
    .from("conversation_messages")
    .select("conversation_id")
    .eq("workspace_id", workspaceId)
    .or(`message_id.in.${list},provider_message_id.in.${list}`)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (sendingAccountId) query = query.eq("sending_account_id", sendingAccountId);
  const { data } = await query;
  const conversationId = data?.[0]?.conversation_id as string | undefined;
  if (!conversationId) return null;
  return loadConversation(db, conversationId);
}

async function markConversationInbound(
  db: Db,
  args: {
    conversationId: string;
    leadId: string | null;
    campaignId: string | null;
    sendingAccountId: string | null;
    receivedIso: string;
    status: string;
    previousCount: number;
    preview: string;
  },
): Promise<string | null> {
  const { error } = await db
    .from("conversations")
    .update({
      unread: true,
      archived: false,
      snoozed_until: null,
      status: args.status,
      message_count: args.previousCount + 1,
      last_message_at: args.receivedIso,
      last_direction: "inbound",
      last_preview: args.preview,
      lead_id: args.leadId,
      campaign_id: args.campaignId,
      sending_account_id: args.sendingAccountId,
      has_inbound: true,
      last_inbound_at: args.receivedIso,
    })
    .eq("id", args.conversationId);
  return error?.message ?? null;
}

/**
 * Last-resort threading when a reply carries no usable headers: the newest
 * conversation with this prospect in this workspace whose subject matches once
 * `Re:`/`Fwd:` prefixes are stripped, else simply the newest one.
 */
async function findConversationByParticipants(
  db: Db,
  workspaceId: string,
  prospect: string,
  subject: string,
  sendingAccountId: string | null,
) {
  let query = db
    .from("conversations")
    .select("id, subject, last_message_at")
    .eq("workspace_id", workspaceId)
    .eq("prospect_email", prospect)
    .order("last_message_at", { ascending: false })
    .limit(20);
  if (sendingAccountId) query = query.eq("sending_account_id", sendingAccountId);
  const { data } = await query;
  const rows = (data ?? []) as { id: string; subject: string | null }[];
  if (!rows.length) return null;

  const wanted = normalizeSubject(subject);
  const bySubject = wanted ? rows.find((r) => normalizeSubject(r.subject) === wanted) : null;
  const chosen = bySubject ?? rows[0];
  return chosen ? loadConversation(db, chosen.id) : null;
}

/** Which workspace owns the mailbox the reply was delivered to. */
async function resolveWorkspaceFromMailbox(db: Db, mailbox: string) {
  const base = baseAddress(mailbox);
  const { data } = await db
    .from("sending_accounts")
    .select("id, workspace_id")
    .ilike("from_email", base)
    .not("workspace_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/** Nothing matched: keep the email in the Unmatched inbox instead of dropping it. */
async function storeUnmatched(db: Db, email: InboundEmail, reason: string) {
  const messageId = stripAngle(email.messageId);
  await db.from("unmatched_inbound_emails").upsert(
    {
      from_email: lower(email.from),
      from_name: email.fromName ?? null,
      to_email: lower(email.to),
      subject: (email.subject ?? "").slice(0, 300),
      body: (email.text ?? previewOf(email.html, 20000) ?? "").slice(0, 100000),
      html: email.html ?? null,
      message_id: messageId,
      in_reply_to: stripAngle(email.inReplyTo),
      reference_ids: (email.references ?? []).map((r) => stripAngle(r)).filter(Boolean) as string[],
      reason: reason.slice(0, 300),
      received_at: email.receivedAt ?? new Date().toISOString(),
    },
    { onConflict: "message_id", ignoreDuplicates: true },
  );
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

  // Routing token if one is present, but it is only a shortcut — a plain reply
  // to a normal mailbox threads just as reliably through headers below.
  const { resolveRouteFromAddress } = await import("@/lib/inbound-routing.server");
  const route = await resolveRouteFromAddress(mailbox);

  const mailboxAccount = await resolveWorkspaceFromMailbox(db, mailbox);
  const campaignMessage = await findCampaignMessage(
    db,
    email,
    prospect,
    route?.workspace_id ?? mailboxAccount?.workspace_id ?? null,
    route?.sending_account_id ?? mailboxAccount?.id ?? null,
  );
  const workspaceId =
    route?.workspace_id ?? campaignMessage?.workspace_id ?? mailboxAccount?.workspace_id ?? null;
  const sendingAccountId =
    route?.sending_account_id ??
    campaignMessage?.sending_account_id ??
    mailboxAccount?.id ??
    null;

  if (!workspaceId) {
    await storeUnmatched(db, email, "No workspace matched this email");
    return { status: "unmatched", reason: "No workspace matched this email" };
  }


  // Duplicate delivery of the very same email: stop before any side effect.
  if (messageId) {
    const { data: existing } = await db
      .from("conversation_messages")
      .select("id, conversation_id")
      .eq("workspace_id", workspaceId)
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      const repair = await db
        .from("conversations")
        .update({ has_inbound: true, last_inbound_at: receivedIso, archived: false })
        .eq("id", existing.conversation_id);
      if (repair.error) return { status: "unmatched", reason: repair.error.message };
      return {
        status: "duplicate",
        conversationId: existing.conversation_id,
        messageId: existing.id,
        workspaceId,
        leadId: null,
        campaignId: null,
        sendingAccountId,
      };
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
  if (!leadId) {
    // Someone replied who is not in the database yet: create the CRM contact
    // so the conversation always has a record to hang activity off. Email is
    // the duplicate key, and the lookup above already ruled out a match.
    const { data: created } = await db
      .from("leads")
      .insert({
        workspace_id: workspaceId,
        email: prospect,
        status: "replied",
        lead_source: "inbound_reply",
      })
      .select("id")
      .maybeSingle();
    leadId = created?.id ?? null;
  }


  const campaignId = route?.campaign_id ?? campaignMessage?.campaign_id ?? null;
  const threadKey = buildThreadKey({
    campaignId,
    prospectEmail: prospect,
    subject,
    sendingAccountId,
  });

  // Thread resolution, strongest signal first:
  // 1. routing token pointing at an exact thread
  // 2. In-Reply-To / References matching a Message-ID we stored
  // 3. the campaign send this reply answers
  // 4. sender + recipient + subject matching an existing thread
  let routedConversation: ConversationRef | null = null;
  if (route?.conversation_id) {
    routedConversation = await loadConversation(db, route.conversation_id);
  }
  if (!routedConversation) {
    routedConversation = await findConversationByHeaders(db, email, workspaceId, sendingAccountId);
  }
  if (!routedConversation && campaignMessage?.id) {
    const { data: viaSend } = await db
      .from("conversation_messages")
      .select("conversation_id")
      .eq("workspace_id", workspaceId)
      .eq("campaign_message_id", campaignMessage.id)
      .order("occurred_at", { ascending: false })
      .limit(1);
    const id = viaSend?.[0]?.conversation_id as string | undefined;
    if (id) routedConversation = await loadConversation(db, id);
  }
  if (!routedConversation) {
    routedConversation = await findConversationByParticipants(
      db,
      workspaceId,
      prospect,
      subject,
      sendingAccountId,
    );
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

  const visibilityError = await markConversationInbound(db, {
    conversationId: conversation.id,
    leadId,
    campaignId,
    sendingAccountId,
    receivedIso,
    status: nextStatus,
    previousCount: conversation.message_count ?? 0,
    preview: previewOf(body),
  });
  if (visibilityError) return { status: "unmatched", reason: visibilityError };

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
    replyBody: body,
  });

  return {
    status: "created",
    conversationId: conversation.id,
    messageId: inserted.id,
    workspaceId,
    leadId,
    campaignId,
    sendingAccountId,
  };
}

/** Lead status, activity, follow-up stop and notifications for a fresh reply. */
async function applyReplyAutomation(args: {
  db: Db;
  workspaceId: string;
  conversationId: string;
  leadId: string | null;
  campaignId: string | null;
  campaignMessage: { id: string; recipient_id: string | null; sending_account_id?: string | null } | null;
  prospect: string;
  subject: string;
  detected: ConversationStatus | null;
  receivedIso: string;
  dedupeKey: string;
  replyBody: string;
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
    // A reply moves the contact into the "Replied" stage, but never drags a
    // contact backwards out of a later stage a human already set.
    const { data: stages } = await db
      .from("crm_stages")
      .select("id, key, position")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });
    const repliedStage = (stages ?? []).find((s: { key: string }) => s.key === "replied");
    const { data: leadRow } = await db
      .from("leads")
      .select("stage_id")
      .eq("id", leadId)
      .maybeSingle();
    const currentPosition =
      (stages ?? []).find((s: { id: string }) => s.id === leadRow?.stage_id)?.position ?? -1;
    const advance =
      repliedStage && currentPosition < repliedStage.position ? repliedStage.id : undefined;

    await db
      .from("leads")
      .update({
        status: leadStatus,
        last_activity_at: args.receivedIso,
        ...(advance ? { stage_id: advance } : {}),
      })
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

    // Mark the most recent send to this lead as replied so campaign metrics
    // read the reply straight off the message state.
    const { data: lastSend } = await db
      .from("campaign_messages")
      .select("id, status, delivery_status")
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (lastSend?.[0]) {
      const { applyDeliveryState } = await import("@/lib/delivery-state.server");
      await applyDeliveryState({ message: lastSend[0], state: "replied", occurredAt: args.receivedIso });
    }


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
      sending_account_id: campaignMessage.sending_account_id ?? null,
      from_email: args.prospect,
      to_email: null,
      subject: args.subject || null,
      body: args.replyBody,
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

  // Fan the reply out to every connected integration that subscribes to it.
  try {
    const { emitIntegrationEvent } = await import("@/lib/integrations.server");
    const payload = {
      lead: { email: args.prospect },
      subject: args.subject || null,
      sentiment: args.detected ?? "neutral",
      message: `Reply from ${args.prospect}${args.subject ? ` — ${args.subject}` : ""}`,
      conversationId,
      campaignId,
      receivedAt: args.receivedIso,
    };
    await emitIntegrationEvent(workspaceId, "reply.received", payload, `reply:${conversationId}:${args.receivedIso}`);
    if (args.detected === "interested") {
      await emitIntegrationEvent(workspaceId, "reply.positive", payload, `positive:${conversationId}:${args.receivedIso}`);
    }
  } catch {
    /* integration delivery must never break inbound processing */
  }

  // Fire automation triggers for the reply. Idempotency keys are derived from
  // the conversation + timestamp so a webhook retry cannot double-run a flow.
  try {
    const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
    const base = {
      workspaceId,
      leadId: leadId ?? null,
      campaignId: campaignId ?? null,
      conversationId,
      payload: {
        email: args.prospect,
        subject: args.subject || null,
        sentiment: args.detected ?? "neutral",
        receivedAt: args.receivedIso,
      },
    };
    await emitAutomationEvent({
      ...base,
      type: "lead.replied",
      idempotencyKey: `lead.replied:${conversationId}:${args.receivedIso}`,
    });
    if (args.detected === "interested") {
      await emitAutomationEvent({
        ...base,
        type: "reply.positive",
        idempotencyKey: `reply.positive:${conversationId}:${args.receivedIso}`,
      });
    }
  } catch {
    /* automations must never break inbound processing */
  }

  // Positive replies also notify the customer by system email. Best-effort:
  // the notifier never throws, so the reply stays intact either way.
  if (args.detected === "interested") {
    const { notifyPositiveReply } = await import("@/lib/positive-reply-notify.server");
    await notifyPositiveReply({
      workspaceId,
      conversationId,
      inboundMessageId: args.dedupeKey,
      leadId: leadId ?? null,
      campaignId: campaignId ?? null,
      leadEmail: args.prospect,
      replyBody: args.replyBody,
    });
  }
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
  html?: string | null;
  messageId: string | null;
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
      html: args.html ?? null,
      message_id: stripAngle(args.messageId ?? args.providerMessageId),
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
      has_outbound: true,
    })
    .eq("id", conversation.id);

  return inserted?.id ?? null;
}
