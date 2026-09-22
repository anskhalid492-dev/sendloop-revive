/**
 * Subject-line performance aggregation.
 *
 * Built on the SAME de-duplicated message units and the SAME totals helper as
 * the sequence tables (`computeUnitTotals`), so the open rate shown per subject
 * line can never disagree with the rest of the Analytics page. No second
 * open-tracking definition exists here: unique opens per logical email, over
 * reachable sends, exactly as `engagement-rates.ts` defines it.
 */
import { computeUnitTotals } from "@/lib/analytics-sequence";
import type { Unit } from "@/lib/campaign-stats";

/** Below this many delivered emails a row is not a meaningful comparison. */
export const SUBJECT_MIN_SAMPLE = 30;

export type SubjectLineRow = {
  /** Stable row id: campaign + subject text. */
  key: string;
  /** The author's subject line, variables left exactly as written. */
  subject: string;
  campaignId: string;
  campaignName: string;
  sent: number;
  delivered: number;
  /** Unique opens (one per logical email, never repeat opens). */
  opens: number;
  bounced: number;
  /** Sequence steps this subject line is used by, for context. */
  steps: number[];
  /** False when the campaign has open tracking switched off. */
  openTracking: boolean;
  /** True when the sample is too small to read as a performance result. */
  lowSample: boolean;
};

type Options = {
  from: Date;
  to: Date;
  /** `${campaignId}|${step}|${variantId ?? "base"}` -> subject line. */
  subjectFor: (unit: Unit) => string | null;
  campaignNames: Map<string, string>;
  /** Campaigns with open tracking switched off. */
  trackingOff?: Set<string>;
};

export function computeSubjectLineStats(
  units: Iterable<Unit>,
  opts: Options,
): SubjectLineRow[] {
  const groups = new Map<
    string,
    { subject: string; campaignId: string; steps: Set<number>; units: Unit[] }
  >();

  for (const unit of units) {
    const subject = opts.subjectFor(unit)?.trim();
    // A unit whose step no longer exists in the sequence definition has no
    // subject to attribute; it is left out rather than invented.
    if (!subject) continue;
    const campaignId = unit.campaignId ?? "";
    const key = `${campaignId}|${subject}`;
    let group = groups.get(key);
    if (!group) {
      group = { subject, campaignId, steps: new Set<number>(), units: [] };
      groups.set(key, group);
    }
    group.steps.add(Math.max(1, unit.step || 1));
    group.units.push(unit);
  }

  const rows: SubjectLineRow[] = [];
  for (const [key, group] of groups) {
    const totals = computeUnitTotals(group.units, { from: opts.from, to: opts.to });
    if (totals.sent === 0) continue;
    rows.push({
      key,
      subject: group.subject,
      campaignId: group.campaignId,
      campaignName: opts.campaignNames.get(group.campaignId) ?? "Untitled campaign",
      sent: totals.sent,
      delivered: totals.delivered,
      opens: totals.opens,
      bounced: totals.bounced,
      steps: Array.from(group.steps).sort((a, b) => a - b),
      openTracking: !opts.trackingOff?.has(group.campaignId),
      lowSample: totals.delivered < SUBJECT_MIN_SAMPLE,
    });
  }

  // Volume-first default order: a big sample is never buried under a 1/1 row.
  return rows.sort((a, b) => b.sent - a.sent || a.subject.localeCompare(b.subject));
}
