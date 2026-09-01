/**
 * Authoritative campaign statistics reader.
 *
 * Every surface (Campaign Overview, Campaign Analytics, workspace Analytics
 * and the dashboard's Campaign performance table) calls this module, so the
 * same rows produce the same numbers everywhere.
 *
 * Reads are message-level and paged; counting and de-duplication happen in the
 * shared pure `computeCampaignStats` function.
 */

import {
  computeCampaignStats,
  type CampaignMessageRow,
  type CampaignStats,
  type MessageEventSignals,
  type SignalKey,
} from "@/lib/campaign-stats";
import { fetchAllRows } from "@/lib/supabase-batch";

// The generated Supabase builder types are extremely noisy here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const MESSAGE_COLUMNS =
  "id, campaign_id, sending_account_id, recipient_id, lead_id, step_order, status, delivery_status, scheduled_at, sent_at, delivered_at, opened_at, clicked_at, replied_at, bounced_at, complained_at, unsubscribed_at, failed_at, delayed_at, updated_at";

/** Provider event names mapped onto the signal they prove. */
const EVENT_SIGNALS: Record<string, SignalKey> = {
  delivered: "delivered_at",
  delivery: "delivered_at",
  opened: "opened_at",
  open: "opened_at",
  clicked: "clicked_at",
  click: "clicked_at",
  replied: "replied_at",
  reply: "replied_at",
  bounced: "bounced_at",
  bounce: "bounced_at",
  hard_bounce: "bounced_at",
  soft_bounce: "bounced_at",
  complained: "complained_at",
  complaint: "complained_at",
  spam: "complained_at",
  unsubscribed: "unsubscribed_at",
  unsubscribe: "unsubscribed_at",
  failed: "failed_at",
  dropped: "failed_at",
  rejected: "failed_at",
};

export type CampaignStatsScope = {
  workspaceId: string;
  /** Restrict to specific campaigns; omit for the whole workspace. */
  campaignIds?: string[];
  from?: Date | null;
  to?: Date | null;
};

export type CampaignStatsBundle = {
  byCampaign: Map<string, CampaignStats>;
  /** Raw message rows, reused by callers that need per-message detail. */
  messages: CampaignMessageRow[];
  /** Per-message signals from the real provider event feed. */
  signals: MessageEventSignals;
};


/**
 * Read every campaign statistic for a workspace (optionally a subset of
 * campaigns) from the underlying message records and provider event feed.
 */
export async function fetchCampaignStats(
  client: Client,
  scope: CampaignStatsScope,
): Promise<CampaignStatsBundle> {
  const ids = scope.campaignIds?.filter(Boolean) ?? null;

  const campaignsQuery = client
    .from("campaigns")
    .select("id, name, status")
    .eq("workspace_id", scope.workspaceId);
  if (ids?.length) campaignsQuery.in("id", ids);
  const { data: campaignRows, error: campaignError } = await campaignsQuery;
  if (campaignError) throw new Error(campaignError.message);

  const campaigns = (campaignRows ?? []) as Array<{
    id: string;
    name: string | null;
    status: string | null;
  }>;
  const campaignIds = campaigns.map((c) => c.id);
  if (!campaignIds.length) return { byCampaign: new Map(), messages: [], signals: new Map() };

  const [messages, recipients, events, replies] = await Promise.all([
    fetchAllRows<CampaignMessageRow>(() =>
      client
        .from("campaign_messages")
        .select(MESSAGE_COLUMNS)
        .eq("workspace_id", scope.workspaceId)
        .in("campaign_id", campaignIds)
        .order("id", { ascending: true }),
    ),
    fetchAllRows<{ campaign_id: string; lead_id: string | null }>(() =>
      client
        .from("campaign_recipients")
        .select("campaign_id, lead_id")
        .eq("workspace_id", scope.workspaceId)
        .in("campaign_id", campaignIds)
        .order("id", { ascending: true }),
    ),
    fetchAllRows<{ message_id: string | null; event_type: string; occurred_at: string }>(() =>
      client
        .from("email_engagement_events")
        .select("message_id, event_type, occurred_at")
        .eq("workspace_id", scope.workspaceId)
        .in("campaign_id", campaignIds)
        .not("message_id", "is", null)
        .order("occurred_at", { ascending: true }),
    ).catch(() => [] as Array<{ message_id: string | null; event_type: string; occurred_at: string }>),
    fetchAllRows<{ campaign_id: string | null; lead_id: string | null; from_email: string | null }>(
      () =>
        client
          .from("campaign_replies")
          .select("campaign_id, lead_id, from_email")
          .eq("workspace_id", scope.workspaceId)
          .eq("sentiment", "positive")
          .in("campaign_id", campaignIds)
          .order("id", { ascending: true }),
    ).catch(
      () => [] as Array<{ campaign_id: string | null; lead_id: string | null; from_email: string | null }>,
    ),
  ]);

  const signals: MessageEventSignals = new Map();
  for (const event of events) {
    const key = EVENT_SIGNALS[String(event.event_type ?? "").toLowerCase()];
    if (!key || !event.message_id) continue;
    const current = signals.get(event.message_id) ?? {};
    const existing = current[key];
    if (!existing || event.occurred_at < existing) current[key] = event.occurred_at;
    signals.set(event.message_id, current);
  }

  const messagesByCampaign = new Map<string, CampaignMessageRow[]>();
  for (const m of messages) {
    const cid = String(m.campaign_id ?? "");
    const list = messagesByCampaign.get(cid);
    if (list) list.push(m);
    else messagesByCampaign.set(cid, [m]);
  }

  const leadsByCampaign = new Map<string, number>();
  for (const r of recipients) {
    leadsByCampaign.set(r.campaign_id, (leadsByCampaign.get(r.campaign_id) ?? 0) + 1);
  }

  const positiveByCampaign = new Map<string, Set<string>>();
  for (const reply of replies) {
    if (!reply.campaign_id) continue;
    const set = positiveByCampaign.get(reply.campaign_id) ?? new Set<string>();
    set.add(reply.lead_id ?? String(reply.from_email ?? "").toLowerCase());
    positiveByCampaign.set(reply.campaign_id, set);
  }

  const byCampaign = new Map<string, CampaignStats>();
  for (const campaign of campaigns) {
    byCampaign.set(
      campaign.id,
      computeCampaignStats({
        campaignId: campaign.id,
        name: campaign.name ?? "",
        status: campaign.status ?? "draft",
        leads: leadsByCampaign.get(campaign.id) ?? 0,
        messages: messagesByCampaign.get(campaign.id) ?? [],
        events: signals,
        positiveReplied: positiveByCampaign.get(campaign.id)?.size ?? 0,
        from: scope.from ?? null,
        to: scope.to ?? null,
      }),
    );
  }

  return { byCampaign, messages, signals };
}

/** Convenience reader for a single campaign. */
export async function fetchOneCampaignStats(
  client: Client,
  workspaceId: string,
  campaignId: string,
  range?: { from?: Date | null; to?: Date | null },
): Promise<CampaignStatsBundle & { stats: CampaignStats }> {
  const bundle = await fetchCampaignStats(client, {
    workspaceId,
    campaignIds: [campaignId],
    from: range?.from ?? null,
    to: range?.to ?? null,
  });
  const { EMPTY_CAMPAIGN_STATS } = await import("@/lib/campaign-stats");
  return {
    ...bundle,
    stats: bundle.byCampaign.get(campaignId) ?? EMPTY_CAMPAIGN_STATS(campaignId),
  };
}
