/**
 * Per-lead delivery state derivation, shared by the campaign detail read and
 * the paginated Leads tab so both always agree.
 *
 * A recipient can have several messages (initial + follow-ups); the strongest
 * real event across them is the lead's live state.
 */
import { isHeldOutcomeUnknown } from "@/lib/campaign-send-phase";

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
  held: 2,
};

/**
 * A message only counts as a real outbound send once the provider accepted it
 * and `sent_at` was written. Queued/scheduled rows, and rows that only carry a
 * webhook timestamp without an accepted send, are never "sent" or "delivered".
 * This is the same rule the campaign/dashboard KPIs use, so the numbers and the
 * activity feeds can never disagree.
 */
export function isAcceptedSend(m: DeliveryMessage): boolean {
  return Boolean(m["sent_at"]);
}

export function messageDeliveryState(m: DeliveryMessage): string {
  const accepted = isAcceptedSend(m);
  // A message cancelled because the recipient bounced, complained or
  // unsubscribed carries that reason, and must report the real outcome instead
  // of a blank "not contacted" (see `@/lib/cancellation-reason`).
  const reason = m["cancelled_reason"];
  if (m["bounced_at"] || m["delivery_status"] === "bounced" || reason === "recipient_bounced") {
    return "bounced";
  }
  if (m["delivered_at"]) return "delivered";
  if (isHeldOutcomeUnknown({ last_error: m["last_error"], attempts: Number(m["attempts"] ?? 0) })) return "held";
  if (m["failed_at"] || m["status"] === "failed") return "failed";
  if (reason === "recipient_complained") return "complained";
  if (reason === "recipient_unsubscribed") return "unsubscribed";
  if (m["status"] === "cancelled") return "not_contacted";
  if (!accepted) return "queued";
  if (m["complained_at"]) return "complained";
  if (m["unsubscribed_at"]) return "unsubscribed";
  if (m["replied_at"]) return "replied";
  if (m["clicked_at"]) return "clicked";
  if (m["opened_at"]) return "opened";
  if (m["delivered_at"]) return "delivered";
  if (m["delayed_at"]) return "delayed";
  return "sent";
}

const STATE_TIMESTAMP: Record<string, readonly string[]> = {
  bounced: ["bounced_at", "last_event_at", "updated_at"],
  failed: ["failed_at", "last_event_at"],
  complained: ["complained_at", "last_event_at", "updated_at"],
  unsubscribed: ["unsubscribed_at", "last_event_at", "updated_at"],
  replied: ["replied_at", "last_event_at"],
  clicked: ["clicked_at", "last_event_at"],
  opened: ["opened_at", "last_event_at"],
  delivered: ["delivered_at", "last_event_at", "sent_at"],
  delayed: ["delayed_at", "last_event_at", "sent_at"],
  sent: ["sent_at", "last_event_at"],
  queued: ["scheduled_at"],
  not_contacted: ["scheduled_at"],
};

/**
 * Timestamp of the event that produced `state` — never a scheduling or
 * bookkeeping timestamp for a contacted state, so "just now" only appears when
 * the real event just happened.
 */
export function stateTimestamp(m: DeliveryMessage, state: string): string | null {
  for (const field of STATE_TIMESTAMP[state] ?? ["last_event_at"]) {
    const value = m[field];
    if (value) return value;
  }
  return null;
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
    const at = stateTimestamp(raw, state);
    if (raw["recipient_id"]) put(raw["recipient_id"] as string, state, at);
    if (raw["lead_id"]) put(`lead:${raw["lead_id"]}`, state, at);
  }
  return live;
}

