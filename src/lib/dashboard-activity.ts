/**
 * Outbound activity rows for the dashboard feed.
 *
 * Only real campaign email records feed this list — the exact same
 * `campaign_messages` rows the "Today's Outbound" KPIs are counted from.
 * Warmup traffic (`warmup_events`, warmup jobs, warmup daily stats) is never a
 * source and is never a fallback: warmup is not outbound activity.
 */
import { messageDeliveryState, stateTimestamp } from "@/lib/campaign-delivery-state";

export type OutboundActivityRow = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
};

type Msg = Record<string, unknown>;

const TITLES: Record<string, string> = {
  delivered: "Email delivered",
  sent: "Email sent",
  opened: "Email opened",
  clicked: "Link clicked",
  replied: "Reply received",
  bounced: "Email bounced",
  failed: "Send failed",
  unsubscribed: "Recipient unsubscribed",
  complained: "Spam complaint",
};

/** States that require an accepted campaign send before they can be shown. */
const SHOWN = new Set(Object.keys(TITLES));

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Builds the outbound slice of the activity feed. Cancelled and still-queued
 * messages produce no row, and each row is stamped with the timestamp of its
 * own event so relative times ("just now") are always truthful.
 */
export function buildOutboundActivity(
  messages: readonly Msg[],
  campaignNameById: ReadonlyMap<string, string>,
  limit = 12,
): OutboundActivityRow[] {
  const rows: OutboundActivityRow[] = [];
  for (const raw of messages) {
    const m = raw as Record<string, string | null>;
    const state = messageDeliveryState(m);
    if (!SHOWN.has(state)) continue;
    const at = stateTimestamp(m, state);
    if (!at) continue;
    const campaign = str(campaignNameById.get(String(m["campaign_id"] ?? ""))) ?? "Campaign";
    rows.push({
      id: `message-${String(m["id"])}-${state}`,
      kind: "outbound",
      title: TITLES[state] as string,
      detail: campaign,
      at,
    });
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
