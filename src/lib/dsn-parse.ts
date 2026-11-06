/**
 * Delivery-failure reports (DSNs) read from a customer's own mailbox.
 *
 * Until now a failure report was recorded with nothing but its subject line
 * ("Undelivered Mail Returned to Sender"), which is why a *temporary* deferral
 * or a *policy/spam block* looked exactly like a dead address. This module reads
 * the machine-readable part of the report so the real outcome is recorded:
 *
 *   - `Status: 4.x.x`, "will retry", "delayed"  -> temporary, NOT a bounce
 *   - explicit invalid-recipient evidence       -> permanent bounce
 *   - policy/reputation/authentication refusal   -> failed send
 *
 * Pure text parsing, no I/O, so it is fully unit tested.
 */

export type DeliveryReport = {
  /**
   * "bounced" is reserved for proof that the recipient address is invalid.
   * "failed" is a permanent sender/policy refusal and must not suppress the
   * recipient. "delayed" is a temporary deferral.
   */
  kind: "bounced" | "delayed" | "failed";
  /** Enhanced status code, e.g. "5.1.1" or "4.4.7". */
  status: string | null;
  /** The receiving server's own words, best available. */
  reason: string;
};

import { classifyEmailOutcome, enhancedStatusCodes } from "@/lib/email-outcome";

export { enhancedStatusCodes };

/**
 * Kept for callers; 550 5.7.193 is now a sender-side Failed outcome under the
 * central engine, so no code is a "rejection bounce" any more.
 */
export function isPermanentRejectionBounce(_value: string | null | undefined): boolean {
  return false;
}

/** True for the named errors that must always be recorded as bounced. */
export function isForcedBounce(value: string | null | undefined): boolean {
  return classifyEmailOutcome(value).reason === "forced_bounce";
}

/** Sender/content/policy/auth refusals say nothing about whether the address exists. */
export function isSenderPolicyFailure(value: string | null | undefined): boolean {
  return classifyEmailOutcome(value).reason === "sender_side";
}

/**
 * Normalizes direct provider events through the central engine:
 *  - "bounced" with sender-side evidence becomes "failed";
 *  - "failed" becomes "bounced" only when recipient failure is established;
 *  - a provider "bounced" with no contradicting evidence stays bounced.
 */
export function normalizeReportedDeliveryKind<T extends string>(
  kind: T,
  detail: string | null | undefined,
): T | "failed" | "bounced" {
  if (kind !== "bounced" && kind !== "failed") return kind;
  const r = classifyEmailOutcome(detail);
  if (r.outcome === "unknown") return "failed";
  if (r.outcome === "bounced") return "bounced";
  if (kind === "bounced" && r.reason === "sender_side") return "failed";
  return kind;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const m = pattern.exec(text);
  return m?.[1]?.trim() ?? null;
}

/** Collapses whitespace and trims a diagnostic string. */
function tidy(value: string | null): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length ? text : null;
}

/**
 * Reads a delivery report. `subject` is only used as a last-resort description.
 */
export function parseDeliveryReport(input: {
  text: string | null | undefined;
  subject?: string | null;
}): DeliveryReport {
  // Unfold RFC 5322/3464 folded header lines first: servers commonly wrap
  // "Diagnostic-Code: smtp; 550" onto continuation lines, which previously
  // left only the bare "550" and dropped the 5.x.x code and the reason text.
  const text = (input.text ?? "").replace(/\r?\n[ \t]+/g, " ");

  const status = firstMatch(text, /\bstatus:\s*([245]\.\d{1,3}\.\d{1,3})/i);
  const diagnostic = tidy(
    firstMatch(text, /diagnostic-code:\s*smtp;\s*([^\r\n]+)/i) ??
      firstMatch(text, /diagnostic-code:\s*([^\r\n]+)/i),
  );
  // Postfix/Exim style inline server reply, e.g. "said: 550 5.7.1 blocked".
  const said = tidy(firstMatch(text, /said:\s*([^\r\n]+)/i));
  const smtpLine = tidy(firstMatch(text, /\b((?:[45]\d{2})[ -][^\r\n]{3,200})/));

  const detail = diagnostic ?? said ?? smtpLine;
  const code = status ?? (detail ? /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(detail)?.[1] ?? null : null);

  const reason =
    detail ??
    tidy(input.subject ?? null) ??
    "Delivery failure reported by the receiving server";

  // The subject is never evidence of a recipient failure.
  // Only the status + server reply are evidence when present: the quoted
  // original message (Authentication-Results, footers) must not flip it.
  const evidence = detail || status ? `${status ?? ""} ${detail ?? ""}` : text;
  const verdict = classifyEmailOutcome(evidence);
  const kind: DeliveryReport["kind"] =
    verdict.outcome === "bounced" ? "bounced" : verdict.outcome === "delayed" ? "delayed" : "failed";
  return { kind, status: code, reason: reason.slice(0, 500) };
}
