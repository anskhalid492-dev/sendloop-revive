/** Current message outcomes, independent of legacy storage status and engagement. */
import { isHeldOutcomeUnknown } from "@/lib/campaign-send-phase";

export type MessageOutcome = "queued" | "sending" | "accepted" | "delivered" | "bounced" | "failed" | "held" | "cancelled";
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

export function messageOutcome(m: OutcomeFacts): MessageOutcome {
  if (m.bounced_at || m.delivery_status === "bounced") return "bounced";
  // Reliable terminal evidence wins over a legacy held/status marker.
  if (m.delivered_at) return "delivered";
  if (m.delivery_status === "failed" || (m.failed_at && !isHeldOutcomeUnknown(m))) return "failed";
  if (isHeldOutcomeUnknown(m)) return "held";
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "failed") return "failed";
  if (m.sent_at) return "accepted";
  if (m.status === "processing") return "sending";
  return "queued";
}

export type MessageOutcomeCounts = Record<MessageOutcome, number> & {
  total: number;
  attempted: number;
  /** Cumulative acceptance, not a mutually exclusive current-state bucket. */
  providerAccepted: number;
};

export function countMessageOutcomes(rows: readonly OutcomeFacts[]): MessageOutcomeCounts {
  const counts: MessageOutcomeCounts = { total: 0, attempted: 0, providerAccepted: 0, queued: 0, sending: 0, accepted: 0, delivered: 0, bounced: 0, failed: 0, held: 0, cancelled: 0 };
  const unique = new Map<string, OutcomeFacts>();
  for (const row of rows) {
    const previous = unique.get(row.id);
    if (!previous || (row.updated_at ?? "") >= (previous.updated_at ?? "")) unique.set(row.id, row);
  }
  for (const row of unique.values()) {
    const outcome = messageOutcome(row);
    counts.total += 1;
    counts[outcome] += 1;
    if (row.sent_at) counts.providerAccepted += 1;
    // attempts=999 is a hold sentinel, never 999 actual attempts.
    if (row.sent_at || ["sending", "delivered", "bounced", "failed", "held"].includes(outcome)) counts.attempted += 1;
  }
  return counts;
}