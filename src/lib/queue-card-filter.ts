/**
 * Queue outcome-card drill-down. Each card's list is chosen with the SAME
 * classifier (`messageOutcome`) that produces the card's count, so a card can
 * never show one number and open a different set of emails.
 */
import { mergeMessageSnapshots, messageOutcome, type MessageOutcome, type OutcomeFacts } from "@/lib/message-outcomes";

export type QueueCardKey =
  | "pending"
  | "scheduled"
  | "processing"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "held"
  | "cancelled";

export type QueueInventoryRow = OutcomeFacts & {
  scheduled_at?: string | null;
  to_email?: string | null;
};

const CARD_OUTCOME: Record<QueueCardKey, MessageOutcome> = {
  pending: "queued",
  scheduled: "queued",
  processing: "sending",
  sent: "accepted",
  delivered: "delivered",
  bounced: "bounced",
  failed: "failed",
  held: "held",
  cancelled: "cancelled",
};

/** True when the row belongs to the card (same split as the card counts). */
export function rowMatchesQueueCard(row: QueueInventoryRow, card: QueueCardKey): boolean {
  if (messageOutcome(row) !== CARD_OUTCOME[card]) return false;
  if (card === "pending") return row.status === "pending";
  if (card === "scheduled") return row.status !== "pending";
  return true;
}

/** Message IDs for a card, ordered like the queue list (scheduled_at ascending, nulls last). */
export function selectQueueCardIds(
  inventory: readonly QueueInventoryRow[],
  card: QueueCardKey,
  options: { search?: string; limit: number },
): string[] {
  const needle = options.search?.trim().toLowerCase();
  return mergeMessageSnapshots(inventory)
    .filter((row) => rowMatchesQueueCard(row, card))
    .filter((row) => !needle || (row.to_email ?? "").toLowerCase().includes(needle))
    .sort((a, b) => {
      const x = a.scheduled_at ?? null;
      const y = b.scheduled_at ?? null;
      if (x === y) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -1 : 1;
    })
    .slice(0, options.limit)
    .map((row) => row.id);
}
