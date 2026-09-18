/**
 * Delivery-failure reports (DSNs) read from a customer's own mailbox.
 *
 * Until now a failure report was recorded with nothing but its subject line
 * ("Undelivered Mail Returned to Sender"), which is why a *temporary* deferral
 * or a *policy/spam block* looked exactly like a dead address. This module reads
 * the machine-readable part of the report so the real outcome is recorded:
 *
 *   - `Status: 4.x.x`, "will retry", "delayed"  -> temporary, NOT a bounce
 *   - `Status: 5.x.x`                            -> permanent bounce
 *
 * Pure text parsing, no I/O, so it is fully unit tested.
 */

export type DeliveryReport = {
  /** "bounced" = permanent failure, "delayed" = temporary deferral. */
  kind: "bounced" | "delayed";
  /** Enhanced status code, e.g. "5.1.1" or "4.4.7". */
  status: string | null;
  /** The receiving server's own words, best available. */
  reason: string;
};

const DELAY_HINTS =
  /(will\s+(be\s+)?retr(y|ied)|still\s+trying|delivery\s+(is\s+)?delayed|temporar(y|ily)|deferred|greylist|try\s+again\s+later|not\s+yet\s+been\s+delivered|no\s+action\s+is\s+required\s+on\s+your\s+part)/i;

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
  const text = input.text ?? "";

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
  const basic = detail ? /\b([45])\d{2}\b/.exec(detail)?.[1] ?? null : null;

  const permanentCode = code?.startsWith("5") || basic === "5";
  const temporaryCode = code?.startsWith("4") || basic === "4";

  const temporary = temporaryCode || (!permanentCode && DELAY_HINTS.test(text));

  const reason =
    detail ??
    tidy(input.subject ?? null) ??
    (temporary ? "Delivery delayed by the receiving server" : "Delivery failure reported by the receiving server");

  return { kind: temporary ? "delayed" : "bounced", status: code, reason: reason.slice(0, 500) };
}
