/**
 * Inbound email processing for the Unified Inbox.
 *
 * This is the single place where a received email becomes a conversation
 * message. It is deliberately idempotent: the same email delivered twice (a
 * webhook retry, a duplicate provider event) resolves to the same conversation
 * and the same message row, and never fires the follow-up automation twice.
 */
import { classifyProspectReply } from "@/lib/reply-classification";
import { syncReplyCrm } from "@/lib/reply-crm.server";
import { enqueueWebhookEvent } from "@/lib/api/v1/webhook-delivery.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildThreadKey,
  classifyInbound,
  normalizeSubject,
  previewOf,
  replySentimentFor,
  stripAngle,
  type ConversationStatus,
} from "@/lib/inbox-model";
import {
  decideCampaignAttribution,
  evaluateSecondaryAttribution,
  evidenceForCandidate,
  type AttributionVerdict,
  type CampaignAttribution,
  type InboundShape,
} from "@/lib/campaign-attribution";


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
  /** Raw headers when the inbound path supplies them (auto-reply detection). */
  headers?: Record<string, string> | null;
  attachments?: { name: string; url?: string | undefined; size?: number | undefined }[];
  /**
   * The mailbox this message was actually read from (IMAP polling). Ordinary
   * mail sitting in that mailbox can be addressed to anyone, so this is used as
   * the workspace anchor when the To address matches nothing.
   */
  deliveredTo?: string | null;
  /**
   * When false, mail that matches nothing is skipped silently instead of being
   * recorded as an inbound failure. Polling a whole mailbox legitimately sees
   * unrelated mail; only provider webhooks should raise an alert.
   */
  recordUnmatched?: boolean;
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
  /** True only when the message was confidently tied to a campaign send. */
  attributed?: boolean;
  attributionEvidence?: CampaignAttribution["evidence"];
};

type Db = typeof supabaseAdmin;

function lower(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Guarantees the thread contains the EXACT email this prospect received.
 *
 * The send path mirrors every campaign email into the conversation, but that
 * step is best-effort (it must never fail an already delivered send). When a
 * reply arrives and the mirror is missing, we recover it from the stored final
 * render on `campaign_messages` — never by re-rendering the campaign template.
 */
export async function ensureSentEmailMirrored(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  args: { conversationId: string; workspaceId: string; campaignMessageId: string },
): Promise<string | null> {
  const { sentCopyOf } = await import("@/lib/sent-snapshot");
  const { SENT_SNAPSHOT_COLUMNS } = await import("@/lib/sent-snapshot.server");

  const { data: existing } = await db
    .from("conversation_messages")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("campaign_message_id", args.campaignMessageId)
    .maybeSingle();
  if (existing) return existing.id as string;

  const base = "id, subject, body, to_email, sending_account_id, provider_message_id, sent_at";
  let row = (
    await db
      .from("campaign_messages")
      .select(`${base}, ${SENT_SNAPSHOT_COLUMNS}`)
      .eq("id", args.campaignMessageId)
      .maybeSingle()
  ).data;
  if (!row) {
    row = (
      await db.from("campaign_messages").select(base).eq("id", args.campaignMessageId).maybeSingle()
    ).data;
  }
  if (!row || !row.sent_at) return null;

  const copy = sentCopyOf(row);
  if (!copy.body && !copy.subject) return null;

  let fromEmail = copy.fromEmail;
  let fromName = copy.fromName;
  if (!fromEmail && row.sending_account_id) {
    const { data: account } = await db
      .from("sending_accounts")
      .select("from_email, from_name")
      .eq("id", row.sending_account_id)
      .maybeSingle();
    fromEmail = account?.from_email ?? null;
    fromName = fromName ?? account?.from_name ?? null;
  }

  const { data: inserted } = await db
    .from("conversation_messages")
    .insert({
      conversation_id: args.conversationId,
      workspace_id: args.workspaceId,
      direction: "outbound",
      from_email: fromEmail ? lower(fromEmail) : "",
      from_name: fromName,
      to_email: lower(copy.toEmail ?? row.to_email ?? ""),
      subject: copy.subject,
      body: copy.body,
      html: copy.html,
      campaign_message_id: args.campaignMessageId,
      sending_account_id: row.sending_account_id ?? null,
      provider_message_id: row.provider_message_id ?? null,
      occurred_at: row.sent_at,
    })
    .select("id")
    .maybeSingle();
  return (inserted?.id as string | undefined) ?? null;
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
  "id, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, subject, to_email, provider_message_id, sent_at";

type CampaignMessageRow = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  recipient_id: string | null;
  sending_account_id: string | null;
  subject?: string | null;
  to_email?: string | null;
  provider_message_id?: string | null;
  sent_at?: string | null;
};

/**
 * Strict attribution: the outbound send this reply answers, found ONLY through
 * a Message-ID we stored when sending (In-Reply-To / References). No subject
 * matching, no "sender exists in the CRM" guessing.
 */
export async function findCampaignMessageByHeaders(
  db: Db,
  email: InboundEmail,
  mailboxWorkspaceId: string | null,
  mailboxAccountIds: string[],
): Promise<{ message: CampaignMessageRow; via: "in_reply_to" | "references" | "thread_message_id" } | null> {
  const candidates = threadCandidates(email);
  if (!candidates.length) return null;

  let registryQuery = db
    .from("outbound_messages")
    .select("ref_id, provider_message_id")
    .eq("ref_table", "campaign_messages")
    .not("ref_id", "is", null)
    .in("provider_message_id", candidates)
    .limit(20);
  if (mailboxWorkspaceId) registryQuery = registryQuery.eq("workspace_id", mailboxWorkspaceId);
  if (mailboxAccountIds.length) registryQuery = registryQuery.in("sending_account_id", mailboxAccountIds);
  const { data: registryRows } = await registryQuery;
  const registry = (registryRows ?? []) as { ref_id: string | null; provider_message_id: string | null }[];
  const registryIds = Array.from(new Set(registry.map((row) => row.ref_id).filter(Boolean))) as string[];
  if (registryIds.length) {
    let linkedQuery = db.from("campaign_messages").select(CAMPAIGN_MESSAGE_COLUMNS).in("id", registryIds).limit(1);
    if (mailboxWorkspaceId) linkedQuery = linkedQuery.eq("workspace_id", mailboxWorkspaceId);
    if (mailboxAccountIds.length) linkedQuery = linkedQuery.in("sending_account_id", mailboxAccountIds);
    const { data: linkedByRegistry } = await linkedQuery;
    const message = linkedByRegistry?.[0] as CampaignMessageRow | undefined;
    if (message) {
      const matched = registry.find((row) => row.ref_id === message.id)?.provider_message_id ?? null;
      return { message, via: evidenceForCandidate(matched, stripAngle(email.inReplyTo)) };
    }
  }

  const list = inList(candidates);
  let campaignQuery = db
    .from("campaign_messages")
    .select(CAMPAIGN_MESSAGE_COLUMNS)
    .or(`provider_message_id.in.${list}`)
    .limit(1);
  if (mailboxWorkspaceId) campaignQuery = campaignQuery.eq("workspace_id", mailboxWorkspaceId);
  if (mailboxAccountIds.length) campaignQuery = campaignQuery.in("sending_account_id", mailboxAccountIds);
  const { data } = await campaignQuery;
  const direct = data?.[0] as CampaignMessageRow | undefined;
  if (direct) {
    return {
      message: direct,
      via: evidenceForCandidate(direct.provider_message_id ?? null, stripAngle(email.inReplyTo)),
    };
  }

  // The id may belong to a reply we sent from the inbox rather than a campaign
  // step: that row carries the campaign message it belongs to.
  let conversationQuery = db
    .from("conversation_messages")
    .select("campaign_message_id")
    .or(`message_id.in.${list},provider_message_id.in.${list}`)
    .not("campaign_message_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (mailboxWorkspaceId) conversationQuery = conversationQuery.eq("workspace_id", mailboxWorkspaceId);
  if (mailboxAccountIds.length) conversationQuery = conversationQuery.in("sending_account_id", mailboxAccountIds);
  const { data: viaConversation } = await conversationQuery;
  const campaignMessageId = viaConversation?.[0]?.campaign_message_id as string | undefined;
  if (campaignMessageId) {
    const { data: linked } = await db
      .from("campaign_messages")
      .select(CAMPAIGN_MESSAGE_COLUMNS)
      .eq("id", campaignMessageId)
      .maybeSingle();
    if (linked) return { message: linked as CampaignMessageRow, via: "thread_message_id" };
  }
  return null;
}

/**
 * Qualified secondary check for a genuine reply whose client dropped the
 * threading headers. A real send to this address is required, the contact must
 * be a recipient of that campaign, it must have left this mailbox, and the
 * inbound must be reply-shaped and not a forward. Subject similarity or simply
 * knowing the sender is never enough.
 */
async function findCampaignMessageBySender(
  db: Db,
  args: {
    shape: InboundShape;
    prospect: string;
    workspaceId: string;
    mailboxAccountId: string | null;
    receivedIso: string;
  },
): Promise<{ message: CampaignMessageRow | null; verdict: AttributionVerdict }> {
  let query = db
    .from("campaign_messages")
    .select(CAMPAIGN_MESSAGE_COLUMNS)
    .eq("workspace_id", args.workspaceId)
    .eq("to_email", args.prospect)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  if (args.mailboxAccountId) query = query.eq("sending_account_id", args.mailboxAccountId);
  const { data } = await query;
  const message = (data?.[0] as CampaignMessageRow | undefined) ?? null;

  if (!message) {
    return {
      message: null,
      verdict: evaluateSecondaryAttribution({
        shape: args.shape,
        leadIsCampaignRecipient: false,
        outboundSendExists: false,
        sameSendingAccount: false,
        sentAt: null,
        receivedAt: args.receivedIso,
      }),
    };
  }

  let leadIsCampaignRecipient = false;
  if (message.campaign_id && message.lead_id) {
    const { data: recipient } = await db
      .from("campaign_recipients")
      .select("id")
      .eq("campaign_id", message.campaign_id)
      .eq("lead_id", message.lead_id)
      .limit(1);
    leadIsCampaignRecipient = Boolean(recipient?.[0]);
  }

  const verdict = evaluateSecondaryAttribution({
    shape: args.shape,
    leadIsCampaignRecipient,
    outboundSendExists: true,
    sameSendingAccount: !args.mailboxAccountId || message.sending_account_id === args.mailboxAccountId,
    sentAt: message.sent_at ?? null,
    receivedAt: args.receivedIso,
  });
  return { message: verdict.attributed ? message : null, verdict };
}

type ConversationRef = {
  id: string;
  status: string;
  message_count: number;
  /** Carried so a threaded reply can inherit the thread's attribution. */
  lead_id?: string | null;
  campaign_id?: string | null;
};

const CONVERSATION_REF_COLUMNS = "id, status, message_count, archived, lead_id, campaign_id";

async function loadConversation(db: Db, id: string): Promise<ConversationRef | null> {
  const { data } = await db
    .from("conversations")
    .select(CONVERSATION_REF_COLUMNS)
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
  if (data?.[0]) return data[0];

  // Self-connected mailbox (the `mailboxes` table) with no sending record: the
  // workspace still owns the address, so a reply to it threads normally. The
  // conversation simply carries no sending-account reference.
  const { data: owned } = await db
    .from("mailboxes")
    .select("workspace_id")
    .ilike("email_address", base)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = owned?.[0] as { workspace_id: string } | undefined;
  return row ? { id: null as unknown as string, workspace_id: row.workspace_id } : null;
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
  // THE decode step. Whichever provider or mailbox this arrived through, the
  // body is cleaned and decoded exactly once, here, and the result is what gets
  // stored. Boundary markers, part headers, base64 and quoted-printable can
  // therefore never reach the Unified Inbox, a notification email, a webhook
  // payload or the reply log — none of those re-parse anything.
  const { cleanInboundText } = await import("@/lib/inbound-body");
  const headerHints = (() => {
    const raw = email.headers ?? null;
    if (!raw) return undefined;
    let contentType: string | null = null;
    let contentTransferEncoding: string | null = null;
    for (const [key, value] of Object.entries(raw)) {
      const name = key.toLowerCase();
      if (name === "content-type") contentType = value;
      if (name === "content-transfer-encoding") contentTransferEncoding = value;
    }
    return contentType || contentTransferEncoding
      ? { contentType, contentTransferEncoding }
      : undefined;
  })();
  const body = (
    cleanInboundText(email.text, headerHints) ??
    cleanInboundText(previewOf(email.html, 20000), headerHints) ??
    ""
  ).slice(0, 100000);
  const receivedAt = email.receivedAt ? new Date(email.receivedAt) : new Date();
  const receivedIso = Number.isNaN(receivedAt.getTime())
    ? new Date().toISOString()
    : receivedAt.toISOString();
  const messageId = stripAngle(email.messageId);

  // Marketing reply attribution: side-effect only, never changes ingestion.
  try {
    const { matchMarketingReply } = await import("@/lib/marketing/engagement.server");
    await matchMarketingReply({
      from: prospect,
      mailboxes: [mailbox, lower(email.deliveredTo ?? "")],
      subject: email.subject ?? null,
      messageId,
      receivedIso,
      headers: email.headers ?? null,
    });
  } catch (error) {
    console.warn("[marketing-reply] attribution failed", error);
  }

  // Routing token if one is present, but it is only a shortcut — a plain reply
  // to a normal mailbox threads just as reliably through headers below.
  const { resolveRouteFromAddress } = await import("@/lib/inbound-routing.server");
  const route = await resolveRouteFromAddress(mailbox);

  const anchor = lower(email.deliveredTo ?? "");
  const mailboxAccount =
    (await resolveWorkspaceFromMailbox(db, mailbox)) ??
    (anchor && anchor !== mailbox ? await resolveWorkspaceFromMailbox(db, anchor) : null);
  const shape: InboundShape = {
    subject,
    body,
    inReplyTo: stripAngle(email.inReplyTo),
    references: (email.references ?? []).map((r) => stripAngle(r)).filter(Boolean) as string[],
  };
  const { replyToAccountScope } = await import("@/lib/mailbox-reply-to");
  const headerAccountIds = await replyToAccountScope(db,
    route?.workspace_id ?? mailboxAccount?.workspace_id ?? null,
    route?.sending_account_id ?? mailboxAccount?.id ?? null, baseAddress(anchor || mailbox));
  const headerMatch = await findCampaignMessageByHeaders(
    db,
    email,
    route?.workspace_id ?? mailboxAccount?.workspace_id ?? null,
    headerAccountIds,
  );
  let campaignMessage: CampaignMessageRow | null = headerMatch?.message ?? null;
  let secondary: { campaignId: string | null; verdict: AttributionVerdict } | null = null;
  const workspaceId =
    route?.workspace_id ?? campaignMessage?.workspace_id ?? mailboxAccount?.workspace_id ?? null;
  const sendingAccountId =
    route?.sending_account_id ??
    campaignMessage?.sending_account_id ??
    mailboxAccount?.id ??
    null;

  if (!workspaceId) {
    // Automated machine reports (DMARC aggregate reports and friends) and mail
    // seen while polling a whole mailbox are expected not to match anything —
    // recording them as failures only produces admin alert noise.
    const { looksLikeAutomatedReport } = await import("@/lib/mailbox-inbound-classify");
    const quiet =
      email.recordUnmatched === false ||
      looksLikeAutomatedReport({
        from: email.from,
        to: email.to,
        subject: email.subject ?? null,
        headers: email.headers ?? null,
      });
    if (!quiet) await storeUnmatched(db, email, "No workspace matched this email");
    return { status: "unmatched", reason: "No workspace matched this email" };
  }

  // Headers identified nothing: run the qualified secondary check. It can only
  // succeed for a campaign recipient replying to a real send on this mailbox.
  if (!campaignMessage && !route?.campaign_id) {
    secondary = await findCampaignMessageBySender(db, {
      shape,
      prospect,
      workspaceId,
      mailboxAccountId: sendingAccountId,
      receivedIso,
    }).then((result) => {
      campaignMessage = result.message;
      return { campaignId: result.message?.campaign_id ?? null, verdict: result.verdict };
    });
  }




  // Duplicate delivery of the very same email: stop before any side effect.
  if (messageId) {
    const { data: existing } = await db
      .from("conversation_messages")
      .select("id, conversation_id, body")
      .eq("workspace_id", workspaceId)
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      const { data: existingConversation } = await db
        .from("conversations")
        .select("lead_id, campaign_id, sending_account_id, status")
        .eq("id", existing.conversation_id)
        .maybeSingle();
      const repair = await db
        .from("conversations")
        .update({ has_inbound: true, last_inbound_at: receivedIso, archived: false })
        .eq("id", existing.conversation_id);
      if (repair.error) return { status: "unmatched", reason: repair.error.message };
      // Only replay work explicitly recorded by this version; historical replies are untouched.
      const { data: processing, error: processingError } = await db.from("conversation_events").select("type, detail").eq("workspace_id", workspaceId).eq("conversation_id", existing.conversation_id).in("dedupe_key", [`classification:${existing.id}`, `processed:${existing.id}`]);
      if (processingError) return { status: "unmatched", reason: "Reply recovery state could not be read" };
      const pending = processing?.find(e => e.type === "reply_classified");
      if (pending && !processing?.some(e => e.type === "reply_processed")) {
        const saved = JSON.parse(pending.detail ?? "{}") as { status: ConversationStatus | null; category: string; leadId: string | null; campaignId: string | null; campaignMessage: CampaignMessageRow | null; prospect: string; subject: string; receivedIso: string; replyBody: string };
        const { data: correction } = await db.from("conversation_events").select("id").eq("workspace_id", workspaceId).eq("conversation_id", existing.conversation_id).eq("type", "updated").not("actor_id", "is", null).gte("created_at", saved.receivedIso).ilike("detail", "Manual classification:%").limit(1);
        if (correction?.length && existingConversation?.status) {
          const { sentimentForStatus } = await import("@/lib/positive-reply-sentiment");
          saved.category = sentimentForStatus(existingConversation.status) ?? "unclassified";
          // Compliance is never undone by a correction.
          if (saved.status !== "unsubscribed") saved.status = existingConversation.status as ConversationStatus;
        }
        await applyReplyAutomation({ db, workspaceId, conversationId: existing.conversation_id, leadId: saved.leadId, campaignId: saved.campaignId, campaignMessage: saved.campaignMessage, prospect: saved.prospect, subject: saved.subject, detected: saved.status, receivedIso: saved.receivedIso, replyBody: existing.body ?? "", dedupeKey: messageId, inboundMessageId: existing.id, sentiment: saved.category });
      }
      return {
        status: "duplicate",
        conversationId: existing.conversation_id,
        messageId: existing.id,
        workspaceId,
        leadId: existingConversation?.lead_id ?? campaignMessage?.lead_id ?? null,
        campaignId: existingConversation?.campaign_id ?? campaignMessage?.campaign_id ?? null,
        sendingAccountId: existingConversation?.sending_account_id ?? sendingAccountId,
      };
    }
  }

  let leadId = route?.lead_id ?? campaignMessage?.lead_id ?? null;
  if (!leadId) {
    const { data: lead } = await db
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("email", prospect.replace(/[\\%_]/g, c => `\\${c}`))
      .limit(1)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }
  // A CRM contact is only created for a confidently attributed campaign reply
  // (below, once attribution is decided). Unrelated mailbox mail must never
  // create or touch CRM records.


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
  // 4. sender + recipient + subject matching an existing thread (display only —
  //    never a campaign attribution signal)
  let routedConversation: ConversationRef | null = null;
  let threadEvidence: "route" | "headers" | "campaign_send" | "participants" | null = null;
  if (route?.conversation_id) {
    routedConversation = await loadConversation(db, route.conversation_id);
    if (routedConversation) threadEvidence = "route";
  }
  if (!routedConversation) {
    routedConversation = await findConversationByHeaders(db, email, workspaceId, sendingAccountId);
    if (routedConversation) threadEvidence = "headers";
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
    if (id) {
      routedConversation = await loadConversation(db, id);
      if (routedConversation) threadEvidence = "campaign_send";
    }
  }
  if (!routedConversation) {
    const byParticipants = await findConversationByParticipants(
      db,
      workspaceId,
      prospect,
      subject,
      sendingAccountId,
    );
    // Sender + subject is never campaign evidence, so an unattributed message
    // must not land on (or revive) a campaign thread.
    const unrelatedToCampaign = !campaignMessage && !route?.campaign_id;
    if (byParticipants && !(unrelatedToCampaign && byParticipants.campaign_id)) {
      routedConversation = byParticipants;
      threadEvidence = "participants";
    }
  }

  // THE attribution verdict. Everything downstream that touches CRM state or
  // campaign analytics is gated on it.
  const threadCampaignId =
    threadEvidence === "route" || threadEvidence === "headers" || threadEvidence === "campaign_send"
      ? (routedConversation?.campaign_id ?? null)
      : null;
  const attribution: CampaignAttribution = decideCampaignAttribution({
    routeCampaignId: route?.campaign_id ?? null,
    headerMatch: headerMatch
      ? { campaignId: headerMatch.message.campaign_id ?? null, via: headerMatch.via }
      : null,
    threadCampaignId,
    secondary,
  });

  if (attribution.attributed && !leadId) {
    // A confidently attributed reply from someone not yet in the database gets
    // a CRM contact so the conversation has a record to hang activity off.
    const { data: created, error: createError } = await db
      .from("leads")
      .upsert({
        workspace_id: workspaceId,
        email: prospect,
        status: "replied",
        lead_source: "inbound_reply",
      }, { onConflict: "workspace_id,email", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (createError) return { status: "unmatched", reason: "CRM contact could not be linked" };
    leadId = created?.id ?? null;
    if (!leadId) {
      const { data: existingLead } = await db.from("leads").select("id").eq("workspace_id", workspaceId).eq("email", prospect).maybeSingle();
      leadId = existingLead?.id ?? null;
    }
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
        campaign_id: attribution.campaignId,
        sending_account_id: sendingAccountId,
        subject: subject || campaignMessage?.subject || "(no subject)",
      },
      { onConflict: "workspace_id,thread_key", ignoreDuplicates: false },
    )
    .select(CONVERSATION_REF_COLUMNS)
    .single();
  const conversation = upserted;
  if (convError || !conversation) {
    return { status: "unmatched", reason: convError?.message ?? "Conversation not created" };
  }

  // Attributed replies carry the campaign; anything else leaves the thread's
  // existing campaign untouched and adds no new association.
  const attributedCampaignId = attribution.attributed
    ? (attribution.campaignId ?? conversation.campaign_id ?? null)
    : (conversation.campaign_id ?? null);
  if (attribution.attributed && !leadId && conversation.lead_id) leadId = conversation.lead_id;

  let attributedMessage: CampaignMessageRow | null = attribution.attributed ? campaignMessage : null;
  if (attribution.attributed && !attributedMessage && attributedCampaignId && leadId) {
    const { data: lastSend } = await db
      .from("campaign_messages")
      .select(CAMPAIGN_MESSAGE_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", attributedCampaignId)
      .eq("lead_id", leadId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    attributedMessage = (lastSend?.[0] as CampaignMessageRow | undefined) ?? null;
  }

  // A reply must always sit under the exact email this prospect received.
  if (attributedMessage?.id) {
    try {
      await ensureSentEmailMirrored(db, {
        conversationId: conversation.id,
        workspaceId,
        campaignMessageId: attributedMessage.id,
      });
    } catch {
      /* recovery is best-effort: the reply itself must always be stored */
    }
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
      campaign_message_id: attributedMessage?.id ?? null,
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

  const classification = classifyProspectReply(body, email.headers ?? null);
  const detected: ConversationStatus | null = classification.status;
  if (attribution.attributed) {
    const { error: classificationError } = await db.from("conversation_events").insert({
      workspace_id: workspaceId, conversation_id: conversation.id,
      type: "reply_classified", dedupe_key: `classification:${inserted.id}`,
      detail: JSON.stringify({ ...classification, classifiedAt: receivedIso, inboundMessageId: inserted.id, leadId, campaignId: attributedCampaignId, campaignMessage: attributedMessage, prospect, subject, receivedIso }),
    });
    if (classificationError && classificationError.code !== "23505") return { status: "unmatched", reason: "Reply classification metadata could not be saved" };
  }
  // Reply sentiment only moves a thread that belongs to a campaign.
  const nextStatus =
    attribution.attributed && conversation.status === "lead" && detected
      ? detected
      : (conversation.status as string);

  const visibilityError = await markConversationInbound(db, {
    conversationId: conversation.id,
    leadId: attribution.attributed ? leadId : (conversation.lead_id ?? leadId),
    campaignId: attributedCampaignId,
    sendingAccountId,
    receivedIso,
    status: nextStatus,
    previousCount: conversation.message_count ?? 0,
    preview: previewOf(body),
  });
  if (visibilityError) return { status: "unmatched", reason: visibilityError };

  if (attribution.attributed) {
    await db.from("conversation_events").insert({
      conversation_id: conversation.id,
      workspace_id: workspaceId,
      type: "reply_received",
      detail: `Reply from ${prospect}`,
      dedupe_key: messageId ? `reply:${messageId}` : null,
    });
  }

  // CRM and campaign analytics only ever see confidently attributed replies.
  // Unrelated mailbox mail stays a plain inbox message: no reply counters, no
  // contact status change, no campaign association, no automation.
  if (attribution.attributed) {
    await applyReplyAutomation({
      db,
      workspaceId,
      conversationId: conversation.id,
      leadId,
      campaignId: attributedCampaignId,
      campaignMessage: attributedMessage,
      prospect,
      subject,
      detected,
      receivedIso,
      dedupeKey: messageId ?? inserted.id,
      inboundMessageId: inserted.id,
      sentiment: classification.category,
      replyBody: body,
    });
  }

  // Every new email that lands in the Unified Inbox notifies the workspace —
  // not only campaign-attributed replies. Bounce reports stay quiet.
  if (detected !== "bounced") {
    await notifyWorkspaceMembers(db, workspaceId, {
      type: "reply",
      title: `New reply from ${prospect}`,
      message: subject || null,
      entity_type: "conversation",
      entity_id: conversation.id,
    });
  }

  return {
    status: "created",
    conversationId: conversation.id,
    messageId: inserted.id,
    workspaceId,
    leadId,
    campaignId: attributedCampaignId,
    sendingAccountId,
    attributed: attribution.attributed,
    attributionEvidence: attribution.evidence,
    ...(attribution.attributed ? {} : { reason: attribution.reason }),
  };
}

/** Insert one bell notification per workspace member. Never throws. */
export async function notifyWorkspaceMembers(
  db: Db,
  workspaceId: string,
  n: { type: string; title: string; message: string | null; entity_type: string; entity_id: string },
) {
  try {
    const { data: members } = await db
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId);
    const rows = (members ?? []).map((m: { user_id: string }) => ({
      user_id: m.user_id,
      workspace_id: workspaceId,
      ...n,
    }));
    if (!rows.length) return;
    const { error } = await db.from("notifications").insert(rows);
    if (error) console.warn("[notifications] insert failed:", error.message);
  } catch (error) {
    console.warn("[notifications] failed:", error instanceof Error ? error.message : error);
  }
}

/** Lead status, activity and follow-up stop for a fresh reply. */
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
  inboundMessageId: string;
  sentiment: string;
}) {
  const { db, workspaceId, conversationId, leadId, campaignId, campaignMessage } = args;

  // Explicit opt-outs precede CRM work and are retried if persistence fails.
  if (args.detected === "unsubscribed") {
    const { error: suppressionError } = await db.from("email_suppressions").upsert({ workspace_id: workspaceId, email: args.prospect, reason: "unsubscribe", source: "inbound_reply", detail: args.subject || null }, { onConflict: "workspace_id,email", ignoreDuplicates: true });
    if (suppressionError) throw new Error(`Reply suppression failed: ${suppressionError.message}`);
    if (leadId) {
      const { error: cancelError } = await db.from("campaign_messages").update({ status: "cancelled", cancelled_reason: "recipient_unsubscribed" } as never).eq("workspace_id", workspaceId).eq("lead_id", leadId).in("status", ["pending", "scheduled"]);
      if (cancelError) throw new Error(`Reply opt-out cancellation failed: ${cancelError.message}`);
    }
  }

  // Original message is already durable; a failed CRM write is safe to replay.
  if (leadId) await syncReplyCrm(db, { ...args, leadId });

  let stopOnReply = true;
  if (campaignId) {
    const { data: campaign } = await db
      .from("campaigns")
      .select("stop_on_reply, name")
      .eq("id", campaignId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    stopOnReply = campaign?.stop_on_reply ?? true;
  }

  if (campaignId && leadId) {
    const { error: recipientError } = await db
      .from("campaign_recipients")
      .update({ status: "replied", ...(stopOnReply ? { next_send_at: null } : {}) })
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId);
    if (recipientError) throw new Error(`Reply recipient update failed: ${recipientError.message}`);

    // Mark the most recent send to this lead as replied so campaign metrics
    // read the reply straight off the message state.
    const { data: lastSend } = await db
      .from("campaign_messages")
      .select("id, status, delivery_status")
      .eq("workspace_id", workspaceId)
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
      const { error: stopError } = await db
        .from("campaign_messages")
        .update({ status: "cancelled", cancelled_reason: "recipient_replied" } as never)
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", campaignId)
        .eq("lead_id", leadId)
        .in("status", ["pending", "scheduled"]);
      if (stopError) throw new Error(`Reply follow-up stop failed: ${stopError.message}`);
    }
  }

  // Mirror into the existing campaign reply log so the queue tab keeps working,
  // and into normalized engagement so analytics sees replies the same way it
  // sees delivered/opened/clicked events. The reply log no longer requires a
  // matched send: a campaign + contact is enough to attribute the reply.
  if (leadId && campaignId) {
    if (campaignMessage?.id) {
      try {
        const { recordCampaignReplyEngagement } = await import("@/lib/engagement.server");
        await recordCampaignReplyEngagement({
          workspaceId,
          campaignId,
          leadId,
          sendingAccountId: campaignMessage.sending_account_id ?? null,
          campaignMessageId: campaignMessage.id,
          recipientEmail: args.prospect,
          externalId: `reply:${args.dedupeKey}`,
          detail: args.subject || null,
          occurredAt: args.receivedIso,
        });
      } catch {
        /* analytics mirroring must never break inbox storage */
      }
    }

    void enqueueWebhookEvent(db, workspaceId, "reply.received", `reply.received:${args.dedupeKey}`, {
      campaign_id: campaignId,
      lead_id: leadId,
      campaign_message_id: campaignMessage?.id ?? null,
      from_email: args.prospect,
      subject: args.subject || null,
      received_at: args.receivedIso,
      sentiment: args.detected ?? null,
    });

    // The inbound message UUID is the reply UUID: concurrent retries cannot insert twice.
    const { error: replyError } = await db.from("campaign_replies").upsert({
      id: args.inboundMessageId,
      workspace_id: workspaceId, campaign_id: campaignId, message_id: campaignMessage?.id ?? null,
      lead_id: leadId, sending_account_id: campaignMessage?.sending_account_id ?? null,
      from_email: args.prospect, subject: args.subject || null, body: args.replyBody,
      sentiment: args.sentiment, received_at: args.receivedIso,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (replyError) throw new Error(`Reply log failed: ${replyError.message}`);
  }


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

  // Every stored reply notifies the customer by system email; a positive reply
  // additionally sends the dedicated positive-reply email. Best-effort: the
  // notifier never throws, so the reply stays intact either way.
  {
    const { notifyPositiveReply, notifyReplyReceived } = await import(
      "@/lib/positive-reply-notify.server"
    );
    const payload = {
      workspaceId,
      conversationId,
      inboundMessageId: args.dedupeKey,
      leadId: leadId ?? null,
      campaignId: campaignId ?? null,
      leadEmail: args.prospect,
      replyBody: args.replyBody,
      subject: args.subject,
    };
    // Bounces and unsubscribes are handled by their own flows, not a "new reply".
    if (args.detected !== "bounced" && args.detected !== "unsubscribed") {
      await notifyReplyReceived(payload);
    }
    if (args.detected === "interested") {
      await notifyPositiveReply(payload);
    }
  }
  const { error: completeError } = await db.from("conversation_events").insert({ workspace_id: workspaceId, conversation_id: conversationId, type: "reply_processed", dedupe_key: `processed:${args.inboundMessageId}`, detail: "Classification and CRM synchronization completed" });
  if (completeError && completeError.code !== "23505") throw new Error(`Reply completion failed: ${completeError.message}`);

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
    .select("id, conversation_id")
    .eq("workspace_id", args.workspaceId)
    .eq("campaign_message_id", args.campaignMessageId)
    .maybeSingle();
  if (existing) {
    let routeUpdate = db
      .from("inbound_routes")
      .update({ conversation_id: existing.conversation_id })
      .eq("workspace_id", args.workspaceId)
      .is("conversation_id", null);
    routeUpdate = args.sendingAccountId
      ? routeUpdate.eq("sending_account_id", args.sendingAccountId)
      : routeUpdate.is("sending_account_id", null);
    routeUpdate = args.leadId ? routeUpdate.eq("lead_id", args.leadId) : routeUpdate.is("lead_id", null);
    routeUpdate = routeUpdate.eq("campaign_id", args.campaignId);
    await routeUpdate;
    return existing.id;
  }

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

  let routeUpdate = db
    .from("inbound_routes")
    .update({ conversation_id: conversation.id })
    .eq("workspace_id", args.workspaceId)
    .is("conversation_id", null);
  routeUpdate = args.sendingAccountId
    ? routeUpdate.eq("sending_account_id", args.sendingAccountId)
    : routeUpdate.is("sending_account_id", null);
  routeUpdate = args.leadId ? routeUpdate.eq("lead_id", args.leadId) : routeUpdate.is("lead_id", null);
  routeUpdate = routeUpdate.eq("campaign_id", args.campaignId);
  await routeUpdate;

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
