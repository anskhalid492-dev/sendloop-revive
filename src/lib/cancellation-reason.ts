/**
 * Why a queued campaign email was cancelled — and the single shared rule for
 * counting bounced / unsubscribed / complained recipients.
 *
 * When a recipient bounces, unsubscribes or complains part-way through a
 * sequence, the remaining queued emails for that person are cancelled. Before
 * `cancelled_reason` existed those rows only said "cancelled", so the real
 * bounce and unsubscribe counts disappeared into the Cancelled bucket on the
 * campaign page, in campaign Analytics, in workspace Analytics and in the
 * shared engagement-rate denominator.
 *
 * Every surface that reports Bounced / Unsubscribed / Complained MUST count
 * through `countOutcomeRecipients` (or the identical SQL in
 * `supabase/manual/campaign-scale-rpcs.sql`) so the number can never drift
 * into separate versions again. Counts are per PERSON: one bounce that stopped
 * three follow-ups is one bounce, never three.
 */

export const CANCELLED_REASONS = [
  "recipient_bounced",
  "recipient_unsubscribed",
  "recipient_complained",
  "recipient_replied",
  "sequence_stopped",
  "manual",
] as const;

export type CancelledReason = (typeof CANCELLED_REASONS)[number];

/** Reasons that prove a delivery outcome, mapped to the metric they feed. */
export const OUTCOME_REASONS = {
  recipient_bounced: "bounced",
  recipient_unsubscribed: "unsubscribed",
  recipient_complained: "complained",
} as const satisfies Partial<Record<CancelledReason, "bounced" | "unsubscribed" | "complained">>;

export type OutcomeMetric = (typeof OUTCOME_REASONS)[keyof typeof OUTCOME_REASONS];

/** Columns needed to count outcomes from `campaign_messages`. */
export const OUTCOME_COLUMNS =
  "id, lead_id, recipient_id, bounced_at, unsubscribed_at, complained_at, cancelled_reason";

/** PostgREST `or(...)` filter selecting every row that proves an outcome. */
export const OUTCOME_OR_FILTER = [
  "bounced_at.not.is.null",
  "unsubscribed_at.not.is.null",
  "complained_at.not.is.null",
  `cancelled_reason.in.(${Object.keys(OUTCOME_REASONS).join(",")})`,
].join(",");

export type OutcomeRow = {
  id?: string | null;
  lead_id?: string | null;
  recipient_id?: string | null;
  bounced_at?: string | null;
  unsubscribed_at?: string | null;
  complained_at?: string | null;
  cancelled_reason?: string | null;
};

/** The person a message belongs to; the unit every outcome is counted by. */
export function outcomeRecipientKey(row: OutcomeRow): string {
  return String(row.recipient_id ?? row.lead_id ?? row.id ?? "");
}

export type OutcomeCounts = { bounced: number; unsubscribed: number; complained: number };

/**
 * Distinct recipients per outcome. A recipient counts when a real provider
 * signal is recorded OR their remaining emails were cancelled for that reason.
 */
export function countOutcomeRecipients(rows: readonly OutcomeRow[]): OutcomeCounts {
  const bounced = new Set<string>();
  const unsubscribed = new Set<string>();
  const complained = new Set<string>();
  for (const row of rows) {
    const key = outcomeRecipientKey(row);
    if (!key) continue;
    const reason = row.cancelled_reason ?? null;
    if (row.bounced_at || reason === "recipient_bounced") bounced.add(key);
    if (row.unsubscribed_at || reason === "recipient_unsubscribed") unsubscribed.add(key);
    if (row.complained_at || reason === "recipient_complained") complained.add(key);
  }
  return { bounced: bounced.size, unsubscribed: unsubscribed.size, complained: complained.size };
}
