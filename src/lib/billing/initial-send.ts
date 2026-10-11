/**
 * Subscription email allowance rule (client-safe, no I/O).
 *
 * Only the initial campaign email to a contact consumes the plan's monthly
 * email allowance; every follow-up step is free. "Initial" is decided from the
 * message's sequence step order against the campaign's first email step —
 * never from subject or body. One campaign_messages row exists per
 * (campaign, recipient, step_order), so each campaign/contact initial counts once.
 */
export type StepLike = { step_order: number; step_type?: string | null; subject?: string | null; body?: string | null };

/** Same first-step rule the queue builder uses when materialising step 1. */
export function firstEmailStepOrder(steps: StepLike[]): number | null {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
  const first = sorted.find(
    (s) => (s.step_type ?? "email") === "email" && (s.subject ?? "").trim() && (s.body ?? "").trim(),
  );
  return first ? first.step_order : null;
}

/**
 * True when this send must be metered. Unknown first step (lookup failed or
 * steps missing) is treated as billable so a lookup failure can never hand
 * out free initial emails.
 */
export function isBillableInitialSend(stepOrder: number | null | undefined, firstStepOrder: number | null): boolean {
  if (firstStepOrder === null) return true;
  if (stepOrder === null || stepOrder === undefined) return true;
  return Number(stepOrder) <= firstStepOrder;
}
