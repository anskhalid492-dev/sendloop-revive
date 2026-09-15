/**
 * Pure aggregations for the Analytics page sections that are derived from the
 * same de-duplicated message units as every other number on the page, so the
 * sequence and variant tables can never disagree with the headline totals.
 */
import type { Unit } from "@/lib/campaign-stats";

export type SequenceTotals = {
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  bounced: number;
  failed: number;
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
    delivered: 0,
    opens: 0,
    clicks: 0,
    replies: 0,
    positiveReplies: 0,
    bounced: 0,
    failed: 0,
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

function accumulate(target: SequenceTotals, unit: Unit, inRange: (iso: string | null) => boolean) {
  if (inRange(unit.sentAt)) target.sent += 1;
  if (inRange(unit.signals.delivered_at) && !unit.signals.bounced_at && !unit.signals.failed_at) {
    target.delivered += 1;
  }
  if (inRange(unit.signals.opened_at)) target.opens += 1;
  if (inRange(unit.signals.clicked_at)) target.clicks += 1;
  if (inRange(unit.signals.replied_at)) target.replies += 1;
  if (inRange(unit.signals.bounced_at)) target.bounced += 1;
  if (!unit.signals.bounced_at && inRange(unit.signals.failed_at)) target.failed += 1;
  if (inRange(unit.signals.unsubscribed_at)) target.unsubscribed += 1;
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

  for (const unit of units) {
    const step = Math.max(1, unit.step || 1);
    let stepRow = steps.get(step);
    if (!stepRow) {
      stepRow = { step, variants: [], ...emptySequenceTotals() };
      steps.set(step, stepRow);
    }
    accumulate(stepRow, unit, inRange);

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
    }
    accumulate(variantRow, unit, inRange);
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
  for (const unit of units) accumulate(totals, unit, inRange);
  return totals;
}
