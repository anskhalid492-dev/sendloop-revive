/**
 * The single source of truth for campaign statistics.
 *
 * Every screen — workspace Analytics, the dashboard's Campaign performance
 * table and the campaign's own Analytics tab — reads these numbers from the
 * `campaign_stats` database function, so they can never disagree.
 *
 * Definitions (message-level, one row per outbound email, never per lead):
 * - sent:        the message left MunchReach (`sent_at` set)
 * - delivered:   accepted by the recipient server and never bounced or failed
 * - opened/clicked/replied/unsubscribed/complained: real provider signals
 * - bounced/failed: mutually exclusive terminal outcomes (a bounce is not a failure)
 * - queued/sending/remaining: work this campaign still owes
 */

export type CampaignStats = {
  campaignId: string;
  name: string;
  status: string;
  leads: number;
  queued: number;
  sending: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  positiveReplied: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  remaining: number;
};

const n = (value: unknown) => Number(value ?? 0) || 0;

export function toCampaignStats(row: Record<string, unknown>): CampaignStats {
  return {
    campaignId: String(row["campaign_id"] ?? ""),
    name: String(row["campaign_name"] ?? "Untitled campaign"),
    status: String(row["status"] ?? "draft"),
    leads: n(row["leads"]),
    queued: n(row["queued"]),
    sending: n(row["sending"]),
    sent: n(row["sent"]),
    delivered: n(row["delivered"]),
    opened: n(row["opened"]),
    clicked: n(row["clicked"]),
    replied: n(row["replied"]),
    positiveReplied: n(row["positive_replied"]),
    bounced: n(row["bounced"]),
    unsubscribed: n(row["unsubscribed"]),
    complained: n(row["complained"]),
    failed: n(row["failed"]),
    remaining: n(row["remaining"]),
  };
}

export const EMPTY_CAMPAIGN_STATS = (campaignId: string, name = "", status = "draft"): CampaignStats => ({
  campaignId,
  name,
  status,
  leads: 0,
  queued: 0,
  sending: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  positiveReplied: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  failed: 0,
  remaining: 0,
});

/** Rate helper shared by every stats surface, so percentages match too. */
export function rate(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}
