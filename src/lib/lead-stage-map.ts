/**
 * The one mapping between lead status and CRM pipeline stage.
 *
 * MunchReach keeps two canonical fields on `leads`:
 *   - `status`   — the lead status (New, Contacted, Replied, Interested, …)
 *   - `stage_id` — the CRM pipeline stage (FK to `crm_stages`)
 *
 * `crm_stage` is a legacy text mirror that older dashboard/analytics queries
 * still read, so it is kept in step but is never the source of truth.
 *
 * Every entry point (Unified Inbox, Leads, CRM board, contact drawer, API,
 * automations) resolves the pair through this module so the two fields can
 * never drift apart.
 */

export const CANONICAL_STAGE_KEYS = [
  "new",
  "contacted",
  "replied",
  "interested",
  "meeting_booked",
  "won",
  "lost",
] as const;

export type StageKey = (typeof CANONICAL_STAGE_KEYS)[number];

/** Human labels for the canonical pipeline stages, used wherever a stage is picked. */
export const STAGE_KEY_LABELS: Record<StageKey, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  meeting_booked: "Meeting booked",
  won: "Won",
  lost: "Lost",
};

/** Lead status → pipeline stage. Statuses that say nothing about the pipeline
 *  (bounced, unsubscribed, paused) are deliberately absent: they must not move
 *  a contact out of the column the user put it in. */
export const STAGE_KEY_FOR_LEAD_STATUS: Record<string, StageKey> = {
  new: "new",
  contacted: "contacted",
  replied: "replied",
  interested: "interested",
  meeting: "meeting_booked",
  completed: "won",
  not_interested: "lost",
};

/** Pipeline stage → lead status. */
export const LEAD_STATUS_FOR_STAGE_KEY: Record<StageKey, string> = {
  new: "new",
  contacted: "contacted",
  replied: "replied",
  interested: "interested",
  meeting_booked: "meeting",
  won: "completed",
  lost: "not_interested",
};

/** Legacy `leads.crm_stage` text kept in step with the real stage. */
export const LEGACY_CRM_STAGE_FOR_KEY: Record<StageKey, string> = {
  new: "prospect",
  contacted: "prospect",
  replied: "engaged",
  interested: "engaged",
  meeting_booked: "opportunity",
  won: "customer",
  lost: "lost",
};

/** Inbox conversation status → the lead status + stage it means. */
export const TRANSITION_FOR_CONVERSATION_STATUS: Record<
  string,
  { status: string; stageKey?: StageKey }
> = {
  lead: { status: "replied", stageKey: "replied" },
  interested: { status: "interested", stageKey: "interested" },
  meeting_booked: { status: "meeting", stageKey: "meeting_booked" },
  meeting_completed: { status: "meeting", stageKey: "meeting_booked" },
  won: { status: "completed", stageKey: "won" },
  not_interested: { status: "not_interested", stageKey: "lost" },
  // Out of office, unsubscribes and bounces are inbox facts, not pipeline moves.
  ooo: { status: "replied" },
  unsubscribed: { status: "unsubscribed" },
  bounced: { status: "bounced" },
};

export function isClosedStageKey(key: string | null | undefined): boolean {
  return key === "won" || key === "lost";
}

/** Legacy `crm_stage` text (still used by the Leads detail sheet) → stage key. */
export const STAGE_KEY_FOR_LEGACY_CRM_STAGE: Record<string, StageKey> = {
  prospect: "new",
  engaged: "replied",
  qualified: "replied",
  opportunity: "meeting_booked",
  customer: "won",
  lost: "lost",
};

/**
 * Automatic (reply-driven) pipeline moves. Forward-only along this order; a
 * custom stage, Won or Lost is a human decision and is never touched.
 */
const AUTO_STAGE_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  interested: 3,
  meeting_booked: 4,
};

/** Stage a detected reply intent means. OOO, bounces and opt-outs move nothing. */
export function autoStageForReply(detected: string | null | undefined): StageKey | null {
  if (detected === "meeting_booked") return "meeting_booked";
  if (detected === "interested") return "interested";
  // Neutral, question-only and negative replies are still real replies; a
  // negative reply is never moved to Lost automatically.
  if (detected === null || detected === undefined || detected === "not_interested" || detected === "lead") return "replied";
  return null;
}

/** True when an automatic move from `currentKey` to `targetKey` is allowed. */
export function canAutoAdvance(currentKey: string | null | undefined, targetKey: StageKey): boolean {
  if (!currentKey) return true;
  const from = AUTO_STAGE_RANK[currentKey];
  if (from === undefined) return false; // Won, Lost or a custom stage
  return (AUTO_STAGE_RANK[targetKey] ?? -1) > from;
}
