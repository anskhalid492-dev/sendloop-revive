/**
 * Backwards-compatible campaign listing rollup.
 *
 * Used only when the connected database has not received the
 * `campaign_overview_rollup` aggregate yet (PostgREST replies `PGRST202`).
 * Without this, the whole Campaigns page failed with a generic
 * "Internal server error" instead of simply showing slightly fewer numbers.
 *
 * Every value is a database-side `head: true` count, so a campaign with
 * 10,000 leads costs exactly as much as one with ten. `positive_replies` and
 * `meetings` need the conversation tables and are reported as 0 here; they are
 * enrichment, not correctness, and the real RPC restores them.
 */
import type { CampaignRollupRow } from "@/lib/campaign-overview";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await task(value);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function campaignOverviewRollupFallback(
  supabase: Client,
  campaignIds: readonly string[],
  dayStart: string,
): Promise<CampaignRollupRow[]> {
  return mapWithConcurrency(campaignIds, 4, async (campaignId) => {
    const messages = () =>
      supabase
        .from("campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);

    const [leads, sent, sentToday, bounced, failed, replies, uncontacted] = await Promise.all([
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId),
      messages().not("sent_at", "is", null),
      messages().gte("sent_at", dayStart),
      messages().not("bounced_at", "is", null),
      messages().not("failed_at", "is", null),
      messages().not("replied_at", "is", null),
      // Recipients still pending have never been emailed; everyone else has.
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "pending"),
    ]);

    for (const res of [leads, sent, sentToday, bounced, failed, replies, uncontacted]) {
      if (res.error) throw new Error(res.error.message);
    }
    const n = (res: { count: number | null }) => Number(res.count ?? 0) || 0;

    return {
      campaign_id: campaignId,
      leads: n(leads),
      sent: n(sent),
      contacted: Math.max(0, n(leads) - n(uncontacted)),
      sent_today: n(sentToday),
      bounced: n(bounced),
      failed: n(failed),
      replies: n(replies),
      positive_replies: 0,
      meetings: 0,
    } satisfies CampaignRollupRow;
  });
}
