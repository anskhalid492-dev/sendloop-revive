/**
 * Correlates a logged test send with the delivery webhook events that landed
 * afterwards, so the UI reports accepted / delivered / bounced truthfully
 * instead of calling provider acceptance a delivery.
 */

export type TestSendRow = {
  request_id: string;
  provider_message_id: string | null;
  status: string;
  error: string | null;
  webhook_event_id?: string | null;
  webhook_status?: string | null;
  webhook_event_type?: string | null;
  webhook_received_at?: string | null;
};

export type WebhookEventRow = {
  id: string;
  message_id: string | null;
  event_type: string;
  status: string | null;
  error: string | null;
  created_at: string;
};

export type TestSendOutcome =
  | "rejected"
  | "accepted"
  | "delivered"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked";

const EVENT_RANK: Record<string, number> = {
  delivered: 1,
  opened: 2,
  clicked: 3,
  complained: 4,
  bounced: 5,
};

/** Picks the most meaningful event for a message id (terminal outcomes win). */
export function pickEvent(
  messageId: string | null,
  events: WebhookEventRow[],
): WebhookEventRow | null {
  if (!messageId) return null;
  const matches = events.filter((e) => e.message_id === messageId);
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => (EVENT_RANK[b.event_type] ?? 0) - (EVENT_RANK[a.event_type] ?? 0),
  )[0]!;
}

export function correlateTestSend<T extends TestSendRow>(row: T, events: WebhookEventRow[]) {
  const event = pickEvent(row.provider_message_id, events);
  const eventType = event?.event_type ?? row.webhook_event_type ?? null;

  let outcome: TestSendOutcome;
  if (row.status === "rejected") outcome = "rejected";
  else if (eventType && eventType in EVENT_RANK) outcome = eventType as TestSendOutcome;
  else outcome = "accepted";

  return {
    ...row,
    outcome,
    webhookEventId: event?.id ?? row.webhook_event_id ?? null,
    webhookStatus: event?.status ?? row.webhook_status ?? "pending",
    webhookEventType: eventType,
    webhookReceivedAt: event?.created_at ?? row.webhook_received_at ?? null,
    webhookError: event?.error ?? null,
  };
}

export const TEST_SEND_LABEL: Record<TestSendOutcome, string> = {
  rejected: "Rejected before delivery",
  accepted: "Accepted — awaiting delivery webhook",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Marked as spam",
  opened: "Delivered and opened",
  clicked: "Delivered and clicked",
};
