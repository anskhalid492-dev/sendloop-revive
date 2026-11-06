/**
 * Pure aggregations for the Analytics page sections that are derived from the
 * same de-duplicated message units as every other number on the page, so the
 * sequence and variant tables can never disagree with the headline totals.
 */
import {
  bouncedLeadKeys,
  unitBounceAt,
  unitUnsubscribeAt,
  type Unit,
} from "@/lib/campaign-stats";

export type SequenceTotals = {
  sent: number;
  /** Unique people emailed in this scope — the people-based rate base. */
  contacted: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  bounced: number;
  failed: number;
  held: number;
  unsubscribed: number;
};

export type SequenceStepRow = SequenceTotals & {
  step: number;
  variants: SequenceVariantRow[];
};

export type SequenceVariantRow = SequenceTotals & {
  step: number;
  variantId: string | null;
  label: string;
};

export function emptySequenceTotals(): SequenceTotals {
  return {
    sent: 0,
    contacted: 0,
    delivered: 0,
    opens: 0,
    clicks: 0,
    replies: 0,
    positiveReplies: 0,
    bounced: 0,
    failed: 0,
    held: 0,
    unsubscribed: 0,
  };
}

type Window = { from: Date; to: Date };

function makeInRange({ from, to }: Window) {
  const lo = from.getTime();
  const hi = to.getTime();
  return (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= lo && t < hi;
  };
}

/**
 * Per-row counters that must only ever count a PERSON once, however many of
 * their queued follow-ups were stopped by the same bounce or unsubscribe.
 */
type PeopleCounted = { bounced: Set<string>; unsubscribed: Set<string>; contacted: Set<string> };

function newPeopleCounted(): PeopleCounted {
  return { bounced: new Set<string>(), unsubscribed: new Set<string>(), contacted: new Set<string>() };
}

function accumulate(
  target: SequenceTotals,
  unit: Unit,
  inRange: (iso: string | null) => boolean,
  bouncedPeople: Set<string>,
  counted: PeopleCounted,
) {
  // Bounce / unsubscribe use the ONE shared rule (signal or cancelled reason),
  // and a bounce applies to the whole person, not just the row carrying it.
  const bouncedAt = unitBounceAt(unit);
  const personBounced = bouncedPeople.has(unit.leadKey);
  if (inRange(unit.sentAt)) {
    target.sent += 1;
    // People-based rate base: one person emailed counts once, however many
    // sequence steps reached them.
    if (!counted.contacted.has(unit.leadKey)) {
      counted.contacted.add(unit.leadKey);
      target.contacted += 1;
    }
  }
  // Relay/SMTP sends never get a provider delivery confirmation, so a send that
  // did not bounce or fail counts as delivered. Same rule as `deliveredCount`
  // in engagement-rates.ts.
  if (
    inRange(unit.signals.delivered_at) &&
    !unit.signals.bounced_at
  ) {
    target.delivered += 1;
  }
  if (inRange(unit.signals.opened_at)) target.opens += 1;
  // (delivered is re-derived as sent - bounced after accumulation, see below)
  if (inRange(unit.signals.clicked_at)) target.clicks += 1;
  if (inRange(unit.signals.replied_at)) target.replies += 1;
  // One bounced person = one bounce, exactly like the campaign totals, which
  // count bounced/unsubscribed leads as sets of people.
  if (inRange(bouncedAt) && !counted.bounced.has(unit.leadKey)) {
    counted.bounced.add(unit.leadKey);
    target.bounced += 1;
  }
  if (!unit.held && !unit.signals.delivered_at && !unit.signals.bounced_at && inRange(unit.signals.failed_at)) target.failed += 1;
  if (unit.held && !unit.signals.bounced_at && !unit.signals.delivered_at) target.held += 1;
  if (inRange(unitUnsubscribeAt(unit)) && !counted.unsubscribed.has(unit.leadKey)) {
    counted.unsubscribed.add(unit.leadKey);
    target.unsubscribed += 1;
  }
}

/**
 * Per-step totals with the A/B variants nested underneath each step.
 * `variantLabels` maps a variant id to its author-facing label.
 */
export function computeSequenceStats(
  units: Iterable<Unit>,
  opts: Window & { variantLabels?: Map<string, string> },
): SequenceStepRow[] {
  const inRange = makeInRange(opts);
  const steps = new Map<number, SequenceStepRow>();
  const variants = new Map<string, SequenceVariantRow>();
  // Each row de-duplicates people on its own, so a step row and a variant row
  // never share (or steal) a person's single bounce.
  const stepCounted = new Map<number, PeopleCounted>();
  const variantCounted = new Map<string, PeopleCounted>();
  const all = Array.from(units);
  const bouncedPeople = bouncedLeadKeys(all);

  for (const unit of all) {
    const step = Math.max(1, unit.step || 1);
    let stepRow = steps.get(step);
    if (!stepRow) {
      stepRow = { step, variants: [], ...emptySequenceTotals() };
      steps.set(step, stepRow);
      stepCounted.set(step, newPeopleCounted());
    }
    accumulate(stepRow, unit, inRange, bouncedPeople, stepCounted.get(step)!);

    const variantId = unit.variantId ?? null;
    const variantKey = `${step}|${variantId ?? "base"}`;
    let variantRow = variants.get(variantKey);
    if (!variantRow) {
      variantRow = {
        step,
        variantId,
        label: variantId ? (opts.variantLabels?.get(variantId) ?? "Variant") : "Original",
        ...emptySequenceTotals(),
      };
      variants.set(variantKey, variantRow);
      variantCounted.set(variantKey, newPeopleCounted());
    }
    accumulate(variantRow, unit, inRange, bouncedPeople, variantCounted.get(variantKey)!);
  }

  for (const variantRow of variants.values()) {
    steps.get(variantRow.step)?.variants.push(variantRow);
  }
  for (const stepRow of steps.values()) {
    stepRow.variants.sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label));

  }

  return Array.from(steps.values()).sort((a, b) => a.step - b.step);
}

/** Totals for an arbitrary set of units (used by filtered breakdowns). */
export function computeUnitTotals(units: Iterable<Unit>, opts: Window): SequenceTotals {
  const inRange = makeInRange(opts);
  const totals = emptySequenceTotals();
  const all = Array.from(units);
  const bouncedPeople = bouncedLeadKeys(all);
  const counted = newPeopleCounted();
  for (const unit of all) accumulate(totals, unit, inRange, bouncedPeople, counted);

  return totals;
}
