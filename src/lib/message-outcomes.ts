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

export function countMessageOutcomes(rows: readonly OutcomeFacts[]): MessageOutcomeCounts {
  const counts: MessageOutcomeCounts = { total: 0, attempted: 0, providerAccepted: 0, queued: 0, sending: 0, accepted: 0, delivered: 0, bounced: 0, failed: 0, held: 0, cancelled: 0 };
  for (const row of mergeMessageSnapshots(rows)) {
    const outcome = messageOutcome(row);
    counts.total += 1;
    counts[outcome] += 1;
    if (row.sent_at) counts.providerAccepted += 1;
    if (row.sent_at || ["sending", "delivered", "bounced", "failed", "held"].includes(outcome)) counts.attempted += 1;
  }
  return counts;
}
