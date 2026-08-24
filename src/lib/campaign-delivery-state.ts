/**
 * Per-lead delivery state derivation, shared by the campaign detail read and
 * the paginated Leads tab so both always agree.
 *
 * A recipient can have several messages (initial + follow-ups); the strongest
 * real event across them is the lead's live state.
 */
export type DeliveryMessage = Record<string, string | null>;

export const DELIVERY_RANK: Record<string, number> = {
  not_contacted: 0,
  queued: 1,
  sent: 2,
  delayed: 3,
  delivered: 4,
  opened: 5,
  clicked: 6,
  replied: 7,
  unsubscribed: 8,
  complained: 9,
  bounced: 10,
  failed: 10,
};

export function messageDeliveryState(m: DeliveryMessage): string {
  if (m["bounced_at"] || m["delivery_status"] === "bounced") return "bounced";
  if (m["failed_at"] || m["status"] === "failed") return "failed";
  if (m["complained_at"]) return "complained";
  if (m["unsubscribed_at"]) return "unsubscribed";
  if (m["replied_at"]) return "replied";
  if (m["clicked_at"]) return "clicked";
  if (m["opened_at"]) return "opened";
  if (m["delivered_at"]) return "delivered";
  if (m["delayed_at"]) return "delayed";
  if (m["sent_at"] || m["status"] === "sent") return "sent";
  if (m["status"] === "cancelled") return "not_contacted";
  return "queued";
}

/**
 * Collapses messages into one state per key. Every message is indexed twice
 * (`recipient_id` and `lead:<lead_id>`) because older rows predate
 * `recipient_id`.
 */
export function aggregateDeliveryStates(
  messages: readonly DeliveryMessage[],
): Map<string, { state: string; at: string | null }> {
  const live = new Map<string, { state: string; at: string | null }>();
  const put = (key: string, state: string, at: string | null) => {
    const prev = live.get(key);
    if (!prev || (DELIVERY_RANK[state] ?? 0) > (DELIVERY_RANK[prev.state] ?? 0)) {
      live.set(key, { state, at });
    } else if (at && prev.at && at > prev.at) {
      live.set(key, { state: prev.state, at });
    }
  };
  for (const raw of messages) {
    const state = messageDeliveryState(raw);
    const at = raw["last_event_at"] ?? raw["sent_at"] ?? raw["scheduled_at"] ?? null;
    if (raw["recipient_id"]) put(raw["recipient_id"] as string, state, at);
    if (raw["lead_id"]) put(`lead:${raw["lead_id"]}`, state, at);
  }
  return live;
}
