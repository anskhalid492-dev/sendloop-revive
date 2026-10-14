/**
 * Send-phase markers for campaign messages (pure, no IO).
 *
 * While a campaign message is `processing`, its `last_error` column carries a
 * short marker saying how far the send got. It needs no schema change and is
 * cleared/overwritten by every terminal write (sent, failed, rescheduled).
 *
 *   dispatch_phase:claimed@<iso>        claimed, provider NOT contacted yet
 *   dispatch_phase:provider_call@<iso>  handed to the mail provider/relay
 *
 * Recovery uses it to separate the two kinds of interrupted rows:
 *  - `claimed` rows never left MunchReach, so re-queueing them cannot cause a
 *    duplicate.
 *  - `provider_call` rows (and rows with no marker, e.g. claimed by older code)
 *    may already have been accepted by the SMTP server, so they are held as
 *    outcome-unknown and never resent automatically.
 */

export const OUTCOME_UNKNOWN_REASON = "send_outcome_unknown_after_interrupt: held for review, not resent";
/** Attempts value that keeps the existing daily retry from ever re-sending it. */
export const NEVER_RETRY_ATTEMPTS = 999;

const PREFIX = "dispatch_phase:";
export type SendPhase = "claimed" | "provider_call";

export function phaseMarker(phase: SendPhase, at: Date): string {
  return `${PREFIX}${phase}@${at.toISOString()}`;
}

export function parsePhaseMarker(value: string | null | undefined): { phase: SendPhase; at: string } | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  const match = /^dispatch_phase:(claimed|provider_call)@(\S+)$/.exec(value.trim());
  if (!match) return null;
  return { phase: match[1] as SendPhase, at: match[2]! };
}

export type InterruptDecision = "requeue" | "hold_unknown";

/** Only a row PROVEN never handed to the provider may be re-queued. */
export function decideInterrupted(lastError: string | null | undefined): InterruptDecision {
  return parsePhaseMarker(lastError)?.phase === "claimed" ? "requeue" : "hold_unknown";
}

/** Audit reason for a held row: records the exact interruption point. */
export function outcomeUnknownReason(lastError: string | null | undefined): string {
  const marker = parsePhaseMarker(lastError);
  const where = marker ? `${marker.phase} at ${marker.at}` : "unrecorded (claimed before phase tracking)";
  return `${OUTCOME_UNKNOWN_REASON} [interrupted during: ${where}]`.slice(0, 500);
}

export function isOutcomeUnknownReason(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith("send_outcome_unknown_after_interrupt"));
}

/**
 * A provider/relay error that does NOT prove the email was refused: the
 * request may have reached the SMTP server before the connection died.
 */
export function isUncertainTransportError(message: string | null | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("aborted due to timeout") ||
    m.includes("timeouterror") ||
    m.includes("the operation was aborted") ||
    m.includes("mail relay returned an unreadable response")
  );
}
