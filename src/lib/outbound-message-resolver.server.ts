import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { providerMessageIdCandidates, providerMessageIdInFilter } from "@/lib/provider-message-id";

export type ResolvedMessageType = "campaign" | "warmup" | "transactional" | "admin_diagnostic" | "manual_reply";

type Db = typeof supabaseAdmin;

export type ResolvedOutboundMessage = {
  messageType: ResolvedMessageType;
  providerMessageId: string | null;
  provider: string | null;
  workspaceId: string | null;
  sendingAccountId: string | null;
  toEmail: string | null;
  refTable: string | null;
  refId: string | null;
  row: Record<string, unknown> | null;
};

type ResolveArgs = {
  providerMessageId: string | null | undefined;
  email?: string | null | undefined;
  workspaceId?: string | null | undefined;
  requireType?: ResolvedMessageType | undefined;
  db?: Db | undefined;
};

const CAMPAIGN_COLUMNS =
  "id, status, delivery_status, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, to_email, provider, provider_message_id, message_type, sent_at";
const CONVERSATION_COLUMNS =
  "id, conversation_id, workspace_id, campaign_message_id, direction, from_email, to_email, sending_account_id, provider_message_id, message_id, occurred_at";
const TRANSACTIONAL_COLUMNS = "id, to_email, provider, provider_message_id, status, sent_at";
const WARMUP_COLUMNS = "id, workspace_id, sending_account_id, to_email, provider, provider_message_id, status, processed_at";

function normalizeType(value: unknown): ResolvedMessageType | null {
  if (
    value === "campaign" ||
    value === "warmup" ||
    value === "transactional" ||
    value === "admin_diagnostic" ||
    value === "manual_reply"
  ) {
    return value;
  }
  return null;
}

function idList(providerMessageId: string | null | undefined): string[] {
  return providerMessageIdCandidates(providerMessageId);
}

async function fetchConcreteRow(
  db: Db,
  refTable: string | null,
  refId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!refTable || !refId) return null;
  if (refTable === "campaign_messages") {
    const { data } = await db.from("campaign_messages").select(CAMPAIGN_COLUMNS).eq("id", refId).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }
  if (refTable === "conversation_messages") {
    const { data } = await db.from("conversation_messages").select(CONVERSATION_COLUMNS).eq("id", refId).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }
  if (refTable === "transactional_emails") {
    const { data } = await db.from("transactional_emails").select(TRANSACTIONAL_COLUMNS).eq("id", refId).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }
  if (refTable === "warmup_jobs") {
    const { data } = await db.from("warmup_jobs").select(WARMUP_COLUMNS).eq("id", refId).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }
  return null;
}

function rowMatchesType(rowType: ResolvedMessageType | null, requireType: ResolvedMessageType | undefined): boolean {
  return !requireType || rowType === requireType || (requireType === "campaign" && rowType === "manual_reply");
}

function rowToResolved(args: {
  messageType: ResolvedMessageType;
  providerMessageId: string | null;
  provider: string | null;
  workspaceId: string | null;
  sendingAccountId: string | null;
  toEmail: string | null;
  refTable: string | null;
  refId: string | null;
  row: Record<string, unknown> | null;
}): ResolvedOutboundMessage {
  return args;
}

async function resolveFromRegistry(args: ResolveArgs, ids: string[]): Promise<ResolvedOutboundMessage | null> {
  if (!ids.length) return null;
  const db = args.db ?? supabaseAdmin;
  let query = db
    .from("outbound_messages")
    .select("provider_message_id, message_type, provider, workspace_id, sending_account_id, to_email, ref_table, ref_id, created_at")
    .in("provider_message_id", ids)
    .order("created_at", { ascending: false })
    .limit(5);
  if (args.workspaceId) query = query.eq("workspace_id", args.workspaceId);
  const { data } = await query;
  for (const item of (data ?? []) as Array<Record<string, unknown>>) {
    const messageType = normalizeType(item["message_type"]);
    if (!messageType || !rowMatchesType(messageType, args.requireType)) continue;
    const refTable = typeof item["ref_table"] === "string" ? item["ref_table"] : null;
    const refId = typeof item["ref_id"] === "string" ? item["ref_id"] : null;
    const row = await fetchConcreteRow(db, refTable, refId);
    return rowToResolved({
      messageType,
      providerMessageId: typeof item["provider_message_id"] === "string" ? item["provider_message_id"] : null,
      provider: typeof item["provider"] === "string" ? item["provider"] : null,
      workspaceId: typeof item["workspace_id"] === "string" ? item["workspace_id"] : null,
      sendingAccountId: typeof item["sending_account_id"] === "string" ? item["sending_account_id"] : null,
      toEmail: typeof item["to_email"] === "string" ? item["to_email"] : null,
      refTable,
      refId,
      row,
    });
  }
  return null;
}

async function resolveCampaignFallback(args: ResolveArgs, ids: string[]): Promise<ResolvedOutboundMessage | null> {
  const db = args.db ?? supabaseAdmin;
  const columns = CAMPAIGN_COLUMNS;
  let rows: Array<Record<string, unknown>> | null = null;
  if (ids.length) {
    const list = providerMessageIdInFilter(ids);
    let query = db
      .from("campaign_messages")
      .select(columns)
      .eq("message_type", "campaign")
      .or(`provider_message_id.in.${list},message_id.in.${list}`)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (args.workspaceId) query = query.eq("workspace_id", args.workspaceId);
    const { data } = await query;
    rows = (data ?? null) as Array<Record<string, unknown>> | null;
  } else if (args.email) {
    let query = db
      .from("campaign_messages")
      .select(columns)
      .eq("message_type", "campaign")
      .eq("to_email", args.email.toLowerCase())
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (args.workspaceId) query = query.eq("workspace_id", args.workspaceId);
    const { data } = await query;
    rows = (data ?? null) as Array<Record<string, unknown>> | null;
  }
  const row = rows?.[0] ?? null;
  if (!row) return null;
  return rowToResolved({
    messageType: "campaign",
    providerMessageId: typeof row["provider_message_id"] === "string" ? row["provider_message_id"] : null,
    provider: typeof row["provider"] === "string" ? row["provider"] : null,
    workspaceId: typeof row["workspace_id"] === "string" ? row["workspace_id"] : null,
    sendingAccountId: typeof row["sending_account_id"] === "string" ? row["sending_account_id"] : null,
    toEmail: typeof row["to_email"] === "string" ? row["to_email"] : null,
    refTable: "campaign_messages",
    refId: typeof row["id"] === "string" ? row["id"] : null,
    row,
  });
}

async function resolveConversationFallback(args: ResolveArgs, ids: string[]): Promise<ResolvedOutboundMessage | null> {
  if (!ids.length || args.requireType === "campaign" || args.requireType === "warmup" || args.requireType === "transactional") return null;
  const db = args.db ?? supabaseAdmin;
  const list = providerMessageIdInFilter(ids);
  let query = db
    .from("conversation_messages")
    .select(CONVERSATION_COLUMNS)
    .or(`provider_message_id.in.${list},message_id.in.${list}`)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (args.workspaceId) query = query.eq("workspace_id", args.workspaceId);
  const { data } = await query;
  const row = (data as Array<Record<string, unknown>> | null)?.[0] ?? null;
  if (!row) return null;
  const campaignMessageId = typeof row["campaign_message_id"] === "string" ? row["campaign_message_id"] : null;
  const direction = typeof row["direction"] === "string" ? row["direction"] : null;
  return rowToResolved({
    messageType: campaignMessageId ? "campaign" : direction === "outbound" ? "manual_reply" : "manual_reply",
    providerMessageId: typeof row["provider_message_id"] === "string" ? row["provider_message_id"] : null,
    provider: null,
    workspaceId: typeof row["workspace_id"] === "string" ? row["workspace_id"] : null,
    sendingAccountId: typeof row["sending_account_id"] === "string" ? row["sending_account_id"] : null,
    toEmail: typeof row["to_email"] === "string" ? row["to_email"] : null,
    refTable: "conversation_messages",
    refId: typeof row["id"] === "string" ? row["id"] : null,
    row,
  });
}

async function resolveWarmupFallback(args: ResolveArgs, ids: string[]): Promise<ResolvedOutboundMessage | null> {
  if (!ids.length || (args.requireType && args.requireType !== "warmup")) return null;
  const db = args.db ?? supabaseAdmin;
  let query = db.from("warmup_jobs").select(WARMUP_COLUMNS).in("provider_message_id", ids).limit(1);
  if (args.workspaceId) query = query.eq("workspace_id", args.workspaceId);
  const { data } = await query;
  const row = (data as Array<Record<string, unknown>> | null)?.[0] ?? null;
  if (!row) return null;
  return rowToResolved({
    messageType: "warmup",
    providerMessageId: typeof row["provider_message_id"] === "string" ? row["provider_message_id"] : null,
    provider: typeof row["provider"] === "string" ? row["provider"] : null,
    workspaceId: typeof row["workspace_id"] === "string" ? row["workspace_id"] : null,
    sendingAccountId: typeof row["sending_account_id"] === "string" ? row["sending_account_id"] : null,
    toEmail: typeof row["to_email"] === "string" ? row["to_email"] : null,
    refTable: "warmup_jobs",
    refId: typeof row["id"] === "string" ? row["id"] : null,
    row,
  });
}

async function resolveTransactionalFallback(args: ResolveArgs, ids: string[]): Promise<ResolvedOutboundMessage | null> {
  if (!ids.length || (args.requireType && args.requireType !== "transactional" && args.requireType !== "admin_diagnostic")) return null;
  const db = args.db ?? supabaseAdmin;
  const { data } = await db.from("transactional_emails").select(TRANSACTIONAL_COLUMNS).in("provider_message_id", ids).limit(1);
  const row = (data as Array<Record<string, unknown>> | null)?.[0] ?? null;
  if (!row) return null;
  return rowToResolved({
    messageType: "transactional",
    providerMessageId: typeof row["provider_message_id"] === "string" ? row["provider_message_id"] : null,
    provider: typeof row["provider"] === "string" ? row["provider"] : null,
    workspaceId: null,
    sendingAccountId: null,
    toEmail: typeof row["to_email"] === "string" ? row["to_email"] : null,
    refTable: "transactional_emails",
    refId: typeof row["id"] === "string" ? row["id"] : null,
    row,
  });
}

export async function findOutboundMessageByProviderMessageId(args: ResolveArgs): Promise<ResolvedOutboundMessage | null> {
  const ids = idList(args.providerMessageId);
  const registry = await resolveFromRegistry(args, ids);
  if (registry) return registry;

  if (!args.requireType || args.requireType === "warmup") {
    const warmup = await resolveWarmupFallback(args, ids);
    if (warmup) return warmup;
  }
  if (!args.requireType || args.requireType === "campaign") {
    const campaign = await resolveCampaignFallback(args, ids);
    if (campaign) return campaign;
  }
  const conversation = await resolveConversationFallback(args, ids);
  if (conversation && rowMatchesType(conversation.messageType, args.requireType)) return conversation;
  const transactional = await resolveTransactionalFallback(args, ids);
  if (transactional) return transactional;

  if (!ids.length && args.requireType === "campaign") {
    return resolveCampaignFallback(args, ids);
  }
  return null;
}
