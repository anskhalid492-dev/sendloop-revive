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

const DELAY_HINTS =
  /(will\s+(be\s+)?retr(y|ied)|still\s+trying|delivery\s+(is\s+)?delayed|temporar(y|ily)|deferred|greylist|try\s+again\s+later|not\s+yet\s+been\s+delivered|no\s+action\s+is\s+required\s+on\s+your\s+part)/i;

const INVALID_RECIPIENT_HINTS =
  /(5\.1\.[01346]\b|unknown\s+(user|recipient|mailbox)|no\s+such\s+(user|recipient|mailbox)|user\s+unknown|recipient\s+(address\s+)?(rejected[^\r\n]*(unknown|invalid|not\s+found|does\s+not\s+exist)|unknown|invalid|not\s+found)|mailbox\s+(unavailable|not\s+found|does\s+not\s+exist)|address\s+(does\s+not\s+exist|not\s+found|invalid)|invalid\s+(address|recipient)|undeliverable\s+address)/i;

/** Sender/content/policy refusals say nothing about whether the address exists. */
export function isSenderPolicyFailure(value: string | null | undefined): boolean {
  const text = value ?? "";
  return /(5\.7\.\d{1,3}\b|message\s+(blocked|rejected)|sender\s+reputation|spam(?:my)?\s*(policy|content)?|policy\s+(block|rejection|violation)|authentication\s+(required|failed)|spf\s+(fail|failure)|dkim\s+(fail|failure)|dmarc\s+(fail|failure)|relay\s+(denied|not\s+permitted)|access\s+denied|not\s+authorized|blacklist|blocklist)/i.test(
    text,
  );
}

/** Normalizes direct provider events through the same safety rule as DSNs. */
export function normalizeReportedDeliveryKind<T extends string>(
  kind: T,
  detail: string | null | undefined,
): T | "failed" {
  return kind === "bounced" && isSenderPolicyFailure(detail) ? "failed" : kind;
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

  if (temporary) return { kind: "delayed", status: code, reason: reason.slice(0, 500) };

  // A generic 5xx response, and especially 5.7.x, can mean the receiving
  // server rejected the sender/content while the recipient itself is valid.
  // Only explicit recipient-invalid evidence is safe to call a bounce and to
  // place on the workspace suppression list.
  const invalidRecipient = INVALID_RECIPIENT_HINTS.test(`${text}\n${reason}`);
  return {
    kind: invalidRecipient ? "bounced" : "failed",
    status: code,
    reason: reason.slice(0, 500),
  };
}
