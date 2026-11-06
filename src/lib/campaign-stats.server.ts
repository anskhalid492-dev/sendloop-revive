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
  "id, campaign_id, sending_account_id, recipient_id, lead_id, step_order, variant_id, status, delivery_status, scheduled_at, sent_at, delivered_at, opened_at, clicked_at, replied_at, bounced_at, complained_at, unsubscribed_at, failed_at, delayed_at, updated_at, cancelled_reason, last_error, attempts";

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

type ReplyRow = {
  campaign_id: string | null;
  lead_id: string | null;
  from_email: string | null;
  sentiment: string | null;
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
  /** Optional event-feed failures must not be presented as confirmed zero delivery. */
  eventReadAvailable?: boolean;
};


/**
 * A single Analytics page render triggers several server functions that all
 * need the same workspace/range read. This very short-lived memo collapses
 * those into one database pass without ever serving visibly stale numbers.
 */
const STATS_CACHE_TTL_MS = 5_000;
const STATS_CACHE = new Map<string, { at: number; value: Promise<CampaignStatsBundle> }>();

function statsCacheKey(scope: CampaignStatsScope): string {
  return [
    scope.workspaceId,
    scope.campaignIds?.filter(Boolean).slice().sort().join(",") ?? "*",
    scope.from?.toISOString() ?? "",
    scope.to?.toISOString() ?? "",
  ].join("|");
}

function pruneStatsCache(now: number) {
  for (const [k, v] of STATS_CACHE) {
    if (now - v.at >= STATS_CACHE_TTL_MS) STATS_CACHE.delete(k);
  }
}

/**
 * Read every campaign statistic for a workspace (optionally a subset of
 * campaigns) from the underlying message records and provider event feed.
 */
export async function fetchCampaignStats(
  client: Client,
  scope: CampaignStatsScope,
): Promise<CampaignStatsBundle> {
  const key = statsCacheKey(scope);
  const now = Date.now();
  const hit = STATS_CACHE.get(key);
  if (hit && now - hit.at < STATS_CACHE_TTL_MS) return hit.value;
  const promise = readCampaignStats(client, scope);
  STATS_CACHE.set(key, { at: now, value: promise });
  promise.catch(() => STATS_CACHE.delete(key));
  pruneStatsCache(now);
  return promise;
}

/**
 * Per-campaign recipient counts via HEAD count queries.
 * Bounded work per request: a handful of tiny requests instead of paging
 * through every recipient row in the workspace.
 */
async function countRecipientsByCampaign(
  client: Client,
  workspaceId: string,
  campaignIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const CONCURRENCY = 6;
  for (let i = 0; i < campaignIds.length; i += CONCURRENCY) {
    const slice = campaignIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (id) => {
        const { count, error } = await client
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("campaign_id", id);
        if (error) throw new Error(error.message);
        return [id, count ?? 0] as const;
      }),
    );
    for (const [id, count] of results) counts.set(id, count);
  }
  return counts;
}

async function readCampaignStats(
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

  let eventReadAvailable = true;
  const [messages, recipientCounts, events, replies] = await Promise.all([
    (async () => {
      // Narrow the read in Postgres instead of downloading the whole table. A
      // row matters when it was sent, is still queued, or was touched (any
      // signal write bumps updated_at) inside the window. The four conditions
      // are read separately and merged by id: one OR across four columns could
      // not use any index and scanned every workspace message per page.
      const base = () =>
        client
          .from("campaign_messages")
          .select(MESSAGE_COLUMNS)
          .eq("workspace_id", scope.workspaceId)
          .in("campaign_id", campaignIds)
          .order("id", { ascending: true });
      if (!(scope.from && scope.to)) return fetchAllRows<CampaignMessageRow>(() => base());
      const lo = scope.from.toISOString();
      const hi = scope.to.toISOString();
      const parts = await Promise.all([
        fetchAllRows<CampaignMessageRow>(() => base().gte("sent_at", lo).lt("sent_at", hi)),
        fetchAllRows<CampaignMessageRow>(() => base().gte("updated_at", lo).lt("updated_at", hi)),
        fetchAllRows<CampaignMessageRow>(() => base().gte("scheduled_at", lo)),
        fetchAllRows<CampaignMessageRow>(() => base().is("sent_at", null)),
      ]);
      const byId = new Map<string, CampaignMessageRow>();
      for (const part of parts) for (const row of part) byId.set((row as { id: string }).id, row);
      return [...byId.values()].sort((a, b) =>
        (a as { id: string }).id < (b as { id: string }).id ? -1 : 1,
      );
    })(),
    // Recipients are only needed for a per-campaign lead count. Downloading
    // every row was the slowest read in this request path (and had no date
    // window), so ask Postgres for the count instead.
    countRecipientsByCampaign(client, scope.workspaceId, campaignIds),
    fetchAllRows<{ message_id: string | null; event_type: string; occurred_at: string }>(() => {
      const q = client
        .from("email_engagement_events")
        .select("message_id, event_type, occurred_at")
        .eq("workspace_id", scope.workspaceId)
        .in("campaign_id", campaignIds)
        .not("message_id", "is", null)
        .order("occurred_at", { ascending: true });
      if (scope.from) q.gte("occurred_at", scope.from.toISOString());
      if (scope.to) q.lt("occurred_at", scope.to.toISOString());
      return q;
    }).catch(() => {
      eventReadAvailable = false;
      return [] as Array<{ message_id: string | null; event_type: string; occurred_at: string }>;
    }),
    fetchAllRows<ReplyRow>(() => {
      // Every stored reply, not just the positive ones: a reply counts as a
      // reply whatever its intent, and the breakdown is derived from the same
      // rows so the inbox, CRM and analytics can never disagree.
      const q = client
        .from("campaign_replies")
        .select("campaign_id, lead_id, from_email, sentiment")
        .eq("workspace_id", scope.workspaceId)
        .in("campaign_id", campaignIds)
        .order("id", { ascending: true });
      if (scope.from) q.gte("received_at", scope.from.toISOString());
      if (scope.to) q.lt("received_at", scope.to.toISOString());
      return q;
    }).catch(() => [] as ReplyRow[]),
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

  const leadsByCampaign = recipientCounts;

  // Message units are keyed by recipient_id when present, so map each contact
  // onto the same key before counting stored replies — otherwise one reply
  // could be counted twice (once from the send row, once from the reply row).
  const unitKeyByLead = new Map<string, string>();
  for (const m of messages) {
    const lead = m.lead_id ? String(m.lead_id) : null;
    if (lead && !unitKeyByLead.has(lead)) {
      unitKeyByLead.set(lead, String(m.recipient_id ?? m.lead_id ?? m.id));
    }
  }

  type ReplyBuckets = {
    all: Set<string>;
    positive: Set<string>;
    negative: Set<string>;
    ooo: Set<string>;
  };
  const repliesByCampaign = new Map<string, ReplyBuckets>();
  for (const reply of replies) {
    if (!reply.campaign_id) continue;
    const buckets =
      repliesByCampaign.get(reply.campaign_id) ??
      ({ all: new Set(), positive: new Set(), negative: new Set(), ooo: new Set() } as ReplyBuckets);
    const leadId = reply.lead_id ? String(reply.lead_id) : null;
    const identity = leadId ?? String(reply.from_email ?? "").toLowerCase();
    if (!identity) continue;
    buckets.all.add((leadId && unitKeyByLead.get(leadId)) || identity);
    const sentiment = String(reply.sentiment ?? "neutral").toLowerCase();
    if (sentiment === "positive") buckets.positive.add(identity);
    else if (sentiment === "negative") buckets.negative.add(identity);
    else if (sentiment === "out_of_office") buckets.ooo.add(identity);
    repliesByCampaign.set(reply.campaign_id, buckets);
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
        positiveReplied: repliesByCampaign.get(campaign.id)?.positive.size ?? 0,
        negativeReplied: repliesByCampaign.get(campaign.id)?.negative.size ?? 0,
        outOfOfficeReplied: repliesByCampaign.get(campaign.id)?.ooo.size ?? 0,
        replyLeadKeys: repliesByCampaign.get(campaign.id)?.all ?? [],
        from: scope.from ?? null,
        to: scope.to ?? null,
      }),
    );
  }

  return { byCampaign, messages, signals, eventReadAvailable };
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
