/**
 * Current message outcomes — the ONE platform-wide definition.
 *
 * Every campaign message ID is in exactly one outcome at a time. Outcomes are
 * independent of engagement (opens, replies, unsubscribes), which are counted
 * separately and never move a message between outcome buckets.
 *
 * - queued     planned, not yet handed to a provider
 * - sending    handed to the dispatcher right now
 * - accepted   the provider/SMTP server accepted it; no later receipt or bounce
 * - delivered  confirmed delivered: an explicit per-message delivery receipt
 * - bounced    a recorded recipient-side rejection of an email that was sent
 * - failed     a definitive sending-side (or other) failure
 * - held       ambiguous: the provider may have accepted it; never retried
 * - cancelled  will never be sent (cancelled before sending)
 *
 * Acceptance is never treated as confirmed delivery, and a cancelled message
 * that was never sent is never a bounce, even when its recipient bounced on a
 * different email.
 */
import { isHeldOutcomeUnknown } from "@/lib/campaign-send-phase";
import { isRetryableFailure } from "@/lib/campaign-run-state";

export type MessageOutcome = "queued" | "sending" | "accepted" | "delivered" | "bounced" | "failed" | "held" | "cancelled";

/** Display order and customer-facing labels, shared by every screen and export. */
export const MESSAGE_OUTCOMES: readonly MessageOutcome[] = [
  "queued",
  "sending",
  "accepted",
  "delivered",
  "bounced",
  "failed",
  "held",
  "cancelled",
] as const;

export const MESSAGE_OUTCOME_LABELS: Record<MessageOutcome, string> = {
  queued: "Queued",
  sending: "Sending",
  accepted: "Accepted",
  delivered: "Confirmed delivered",
  bounced: "Bounced",
  failed: "Failed",
  held: "Held for review",
  cancelled: "Cancelled",
};

export type OutcomeFacts = {
  id: string;
  status?: string | null;
  delivery_status?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  failed_at?: string | null;
  last_error?: string | null;
  attempts?: number | null;
  updated_at?: string | null;
};

/** Cancelled before any provider accepted it: never a bounce, failure or delivery. */
export function isCancelledUnsent(m: Pick<OutcomeFacts, "status" | "sent_at">): boolean {
  return m.status === "cancelled" && !m.sent_at;
}

export function messageOutcome(m: OutcomeFacts): MessageOutcome {
  if (isCancelledUnsent(m)) return "cancelled";
  if (m.bounced_at || m.delivery_status === "bounced") return "bounced";
  // Reliable terminal evidence wins over a legacy held/status marker.
  if (m.delivered_at) return "delivered";
  // Ambiguous outcomes are held, never failed, whatever their legacy status says.
  if (isHeldOutcomeUnknown(m)) return "held";
  if (m.delivery_status === "failed" || m.failed_at) return "failed";
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "failed") return "failed";
  if (m.sent_at) return "accepted";
  if (m.status === "processing") return "sending";
  return "queued";
}

/**
 * A definitive, never-accepted failure the engine may attempt again. Held,
 * bounced, accepted and cancelled messages are never retryable.
 */
export function isRetryableMessage(m: OutcomeFacts): boolean {
  return messageOutcome(m) === "failed" && !m.sent_at && isRetryableFailure(m.last_error ?? null);
}

export type MessageOutcomeCounts = Record<MessageOutcome, number> & {
  /** Distinct message IDs. Always equals the sum of the eight outcomes. */
  total: number;
  attempted: number;
  /** Cumulative acceptance (`sent_at`), not a mutually exclusive current-state bucket. */
  providerAccepted: number;
  /** Definitive failures the engine may attempt again (never held). */
  retryable: number;
};

/** Latest snapshot owns status; immutable provider evidence survives repeated reads. */
export function mergeMessageSnapshots<T extends OutcomeFacts>(rows: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const previous = unique.get(row.id);
    if (!previous) { unique.set(row.id, { ...row }); continue; }
    const newer = (row.updated_at ?? "") >= (previous.updated_at ?? "") ? row : previous;
    const older = newer === row ? previous : row;
    const merged = { ...older, ...newer };
    for (const field of ["sent_at", "delivered_at", "bounced_at"] as const) {
      const a = previous[field]; const b = row[field];
      if (a || b) merged[field] = !a ? (b ?? null) : !b ? a : a < b ? a : b;
    }
    unique.set(row.id, merged);
  }
  return [...unique.values()];
}

export function emptyOutcomeCounts(): MessageOutcomeCounts {
  return { total: 0, attempted: 0, providerAccepted: 0, retryable: 0, queued: 0, sending: 0, accepted: 0, delivered: 0, bounced: 0, failed: 0, held: 0, cancelled: 0 };
}

export function countMessageOutcomes(rows: readonly OutcomeFacts[]): MessageOutcomeCounts {
  const counts = emptyOutcomeCounts();
  for (const row of mergeMessageSnapshots(rows)) {
    const outcome = messageOutcome(row);
    counts.total += 1;
    counts[outcome] += 1;
    if (row.sent_at) counts.providerAccepted += 1;
    if (row.sent_at || ["sending", "delivered", "bounced", "failed", "held"].includes(outcome)) counts.attempted += 1;
    if (isRetryableMessage(row)) counts.retryable += 1;
  }
  return counts;
}

/** Per-lead current outcome for the Lead Breakdown (each lead counted once). */
export type LeadOutcome = MessageOutcome | "not_contacted";

export const LEAD_OUTCOMES: readonly LeadOutcome[] = ["not_contacted", ...MESSAGE_OUTCOMES] as const;

export const LEAD_OUTCOME_LABELS: Record<LeadOutcome, string> = {
  not_contacted: "Not contacted",
  ...MESSAGE_OUTCOME_LABELS,
};

/**
 * A lead's state from its own messages: a recorded bounce wins, then delivery
 * evidence, acceptance, held, failure, in-flight, queued and finally
 * cancelled. Engagement never changes it.
 */
const LEAD_PRIORITY: MessageOutcome[] = ["bounced", "delivered", "accepted", "held", "failed", "sending", "queued", "cancelled"];

export function leadOutcomeCounts(
  rows: readonly (OutcomeFacts & { recipient_id?: string | null; lead_id?: string | null })[],
  totalLeads: number,
): Record<LeadOutcome, number> {
  const best = new Map<string, number>();
  for (const row of mergeMessageSnapshots(rows)) {
    const key = String(row.recipient_id ?? row.lead_id ?? row.id);
    const rank = LEAD_PRIORITY.indexOf(messageOutcome(row));
    const prev = best.get(key);
    if (prev === undefined || rank < prev) best.set(key, rank);
  }
  const counts = Object.fromEntries(LEAD_OUTCOMES.map(o => [o, 0])) as Record<LeadOutcome, number>;
  for (const rank of best.values()) counts[LEAD_PRIORITY[rank]!] += 1;
  counts.not_contacted = Math.max(0, totalLeads - best.size);
  return counts;
}
