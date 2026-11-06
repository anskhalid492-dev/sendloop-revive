/**
 * The ONE email outcome classification engine.
 *
 * Every sending path (standard and queue campaign sending, retries, provider
 * webhooks, inbound DSN reports) reads an SMTP/provider response through this
 * function, so every customer, workspace and mailbox gets the same rules.
 *
 * Outcomes:
 *   bounced — the recipient/mailbox failure is ESTABLISHED by the diagnostic
 *   failed  — sender-side / policy / auth / config refusal, or an ambiguous 5xx
 *   delayed — temporary 4xx / deferral (not a bounce)
 *   unknown — the provider may have accepted it; never resend, never bounce
 *
 * Safety order: unknown > sender-side evidence > temporary > recipient
 * evidence > named forced patterns > failed. A 5xx code alone is never Bounced.
 *
 * Pure, client-safe, no I/O.
 */

export type EmailOutcome = "bounced" | "failed" | "delayed" | "unknown";

export type EmailOutcomeReason =
  | "outcome_unknown"
  | "sender_side"
  | "temporary"
  | "recipient_invalid"
  | "mailbox_unavailable"
  | "forced_bounce"
  | "ambiguous_permanent"
  | "no_evidence";

export type EmailOutcomeResult = {
  outcome: EmailOutcome;
  reason: EmailOutcomeReason;
  /** Basic SMTP reply code, e.g. "550". */
  smtpCode: string | null;
  /** Every enhanced status code found, e.g. ["5.1.1"]. */
  enhancedCodes: string[];
  /** True only when the address itself is proven bad: safe to suppress. */
  recipientInvalid: boolean;
};

/** Every enhanced status code (x.y.z) embedded anywhere in the text. */
export function enhancedStatusCodes(value: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (value ?? "").matchAll(/(?<![\d.])([245])\.(\d{1,3})\.(\d{1,3})(?![\d.])/g)) {
    out.push(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return out;
}

/** First basic 3-digit SMTP reply code (handles "550-5.1.1" and "550 "). */
export function basicSmtpCode(value: string | null | undefined): string | null {
  return /(?<![\d.])([245]\d{2})(?![\d.])/.exec(value ?? "")?.[1] ?? null;
}

const UNKNOWN_HINTS =
  /(send_outcome_unknown_after_interrupt|outcome[\s_-]*unknown|timed?\s*out\s+after\s+(data|submission|message)|connection\s+(lost|closed|reset|interrupted)\s+(during|after)\s+(data|submission|message|send)|no\s+provider\s+confirmation|missing\s+provider\s+confirmation)/i;

/** Sender-side evidence. Any match outranks a generic bounce code. */
const SENDER_SIDE_HINTS =
  /(\bdkim\b|\bspf\b|\bdmarc\b|\btls\b|starttls|authenticat|auth(entication)?\s+required|credential|invalid\s+(login|password|username)|login\s+(failed|denied)|username\s+and\s+password|sender\s+(reputation|address\s+rejected|domain|not\s+allowed|policy|blocked|verify)|reputation|spam|junk\s+mail|blacklist|blocklist|\brbl\b|spamhaus|message\s+(blocked|rejected\s+(due|because|for))|content\s+(rejected|policy)|security\s+(policy|reasons)|policy\s+(block|rejection|violation|reasons)|rejected\s+(by|due\s+to)\s+policy|relay\s+(denied|not\s+permitted|access)|relaying\s+denied|access\s+denied|not\s+authori[sz]ed|unauthenticated|dns\s+(error|failure|lookup)|reverse\s+dns|ptr\s+record|helo|ehlo|rate\s+limit|too\s+many\s+(messages|connections)|configuration|not\s+configured|usersubmission)/i;

const SENDER_SIDE_BASIC_CODES = new Set(["530", "534", "535", "538"]);

const RECIPIENT_HINTS =
  /(user\s+unknown|no\s+mailbox\b|unknown\s+(user|recipient|mailbox|address)|no\s+such\s+(user|recipient|mailbox|address|account)|(mailbox|recipient|user|address|account)\s+(does\s+not|doesn'?t)\s+exist|(email\s+)?account\s+that\s+you\s+tried\s+to\s+reach\s+(does\s+not|doesn'?t)\s+exist|doesn'?t\s+have\s+an?\s+\S+\s+account|mailbox\s+(not\s+found|unavailable|is\s+disabled|disabled|inactive)|requested\s+action\s+not\s+taken:?\s*mailbox\s+unavailable|recipient\s+(not\s+found|unavailable|invalid|unknown|rejected[^\r\n]{0,40}(unknown|invalid|not\s+found|does\s+not\s+exist))|invalid\s+(recipient|address|mailbox|destination\s+mailbox)|address\s+(not\s+found|invalid|does\s+not\s+exist)|undeliverable\s+address|account\s+(has\s+been\s+)?disabled|mailbox\s+(is\s+)?full|over\s+quota|quota\s+exceeded|mailbox\s+full)/i;

/** Enhanced codes that, under a permanent reply, establish recipient failure. */
const RECIPIENT_CODES = new Set(["5.1.0", "5.1.1", "5.1.2", "5.1.3", "5.1.6", "5.1.10", "5.2.1", "5.2.2"]);

/**
 * Permanent enhanced-code classes that are recipient/destination-side by
 * definition (RFC 3463): 5.1.x addressing, 5.2.x mailbox status, 5.4.x
 * network/routing to the destination. Sender-address subjects (5.1.7 bad
 * sender syntax, 5.1.8 bad sender domain) and 5.2.3 (message too large — our
 * content) are excluded and stay Failed.
 */
const NON_RECIPIENT_CODES = new Set(["5.1.7", "5.1.8", "5.2.3"]);
function recipientClassCode(codes: string[]): string | undefined {
  return codes.find(
    (c) => !NON_RECIPIENT_CODES.has(c) && (c.startsWith("5.1.") || c.startsWith("5.2.") || c.startsWith("5.4.")),
  );
}

/** Message-size / content wording: a 552 with this is about our message. */
const SIZE_HINTS = /(too\s+(large|big)|size\s+(limit|exceed)|exceeds?\s+(the\s+)?(maximum|size|message)|message\s+(length|size))/i;

/** "Recipient address rejected" — receiving server refusing the RECIPIENT. */
const RECIPIENT_REJECTED = /recipient\s+address\s+rejected/i;

/** Exact customer-named patterns always recorded as bounced (never suppressed). */
const FORCED_BOUNCE_PATTERNS: RegExp[] = [
  /\b550\s+5\.7\.1_etr\b/i,
  /this\s+message\s+could\s+not\s+be\s+delivered\.?\s*please\s+contact\s+support/i,
  /\b554\s+read\b/i,
  /\b550\s+permanent\b/i,
];

const MS_DBEB = /recipient\s+address\s+rejected\s*:?\s*access\s+denied[\s\S]{0,80}\bAS\(201806281\)/i;

const TEMPORARY_HINTS =
  /(will\s+(be\s+)?retr(y|ied)|still\s+trying|delivery\s+(is\s+)?delayed|temporar(y|ily)|deferred|greylist|try\s+again\s+later|not\s+yet\s+been\s+delivered|connection\s+(refused|timed?\s*out|reset)|service\s+(temporarily\s+)?unavailable)/i;

function result(
  outcome: EmailOutcome,
  reason: EmailOutcomeReason,
  smtpCode: string | null,
  enhancedCodes: string[],
): EmailOutcomeResult {
  return {
    outcome,
    reason,
    smtpCode,
    enhancedCodes,
    recipientInvalid: outcome === "bounced" && (reason === "recipient_invalid" || reason === "mailbox_unavailable"),
  };
}

export function classifyEmailOutcome(
  input: string | null | undefined | { text?: string | null; subject?: string | null; interrupted?: boolean },
): EmailOutcomeResult {
  const obj: { text?: string | null | undefined; interrupted?: boolean | undefined } =
    typeof input === "object" && input !== null ? input : { text: input };
  const raw = `${obj.text ?? ""}`;
  // Normalise spacing/case; keep punctuation so codes still parse.
  const text = raw.replace(/\s+/g, " ").trim();
  const codes = enhancedStatusCodes(text);
  const smtp = basicSmtpCode(text);

  if (obj.interrupted || UNKNOWN_HINTS.test(text)) return result("unknown", "outcome_unknown", smtp, codes);
  if (!text) return result("failed", "no_evidence", smtp, codes);

  // Forced patterns, unless the diagnostic also carries sender-side evidence
  // beyond the pattern itself.
  if (FORCED_BOUNCE_PATTERNS.some((p) => p.test(text))) {
    const rest = FORCED_BOUNCE_PATTERNS.reduce((t, p) => t.replace(p, " "), text);
    if (!SENDER_SIDE_HINTS.test(rest)) return result("bounced", "forced_bounce", smtp, codes);
    return result("failed", "sender_side", smtp, codes);
  }

  // Microsoft 365 Directory-Based Edge Blocking: "550 5.4.1 Recipient address
  // rejected: Access denied. AS(201806281)". The AS(201806281) tag is Microsoft's
  // documented "recipient not in directory" code — only with it is this a
  // recipient failure; without it the same wording stays Failed (no guessing).
  if (MS_DBEB.test(text) && codes.includes("5.4.1") && smtp?.startsWith("5")) {
    return result("bounced", "recipient_invalid", smtp, codes);
  }

  // 5.4.x destination/routing refusal of the recipient ("550 5.4.1 Recipient
  // address rejected: Access denied" without the AS tag, Gmail/Exchange
  // routing failures). "access denied" here describes the recipient, so it is
  // checked before the generic sender-side wording.
  if (
    smtp?.startsWith("5") !== false &&
    codes.some((c) => c.startsWith("5.4.")) &&
    !codes.some((c) => c.startsWith("5.7.")) &&
    (RECIPIENT_REJECTED.test(text) || !SENDER_SIDE_HINTS.test(text))
  ) {
    return result("bounced", "recipient_invalid", smtp, codes);
  }

  const senderCode = codes.some((c) => c.startsWith("5.7.") || c.startsWith("4.7.")) || (smtp !== null && SENDER_SIDE_BASIC_CODES.has(smtp));
  if (senderCode || SENDER_SIDE_HINTS.test(text)) return result("failed", "sender_side", smtp, codes);

  const temporaryCode = smtp?.startsWith("4") || codes.some((c) => c.startsWith("4."));
  const permanentCode = smtp?.startsWith("5") || codes.some((c) => c.startsWith("5."));
  if (temporaryCode) return result("delayed", "temporary", smtp, codes);

  const recipientCode = codes.find((c) => RECIPIENT_CODES.has(c)) ?? recipientClassCode(codes);
  if (recipientCode) {
    return result("bounced", recipientCode.startsWith("5.2.") ? "mailbox_unavailable" : "recipient_invalid", smtp, codes);
  }
  if (RECIPIENT_HINTS.test(text)) {
    // Mailbox-subclass (5.2.x/x.4.x) without recipient code but with wording
    // is still recipient evidence; a bare temporary hint is not.
    return result("bounced", /full|quota|disabled|inactive/i.test(text) ? "mailbox_unavailable" : "recipient_invalid", smtp, codes);
  }
  // 552 (RFC 5321: exceeded storage allocation) is the recipient mailbox
  // refusing for storage, unless the server says our message is too large.
  if (smtp === "552" && !SIZE_HINTS.test(text) && !codes.some((c) => c.startsWith("5.3.") || c.startsWith("5.6."))) {
    return result("bounced", "mailbox_unavailable", smtp, codes);
  }
  // 5.0.x is generic: bounced only when the server's own words name the
  // recipient/mailbox failure (handled above); otherwise stays ambiguous.
  if (!permanentCode && TEMPORARY_HINTS.test(text)) return result("delayed", "temporary", smtp, codes);
  return result("failed", permanentCode ? "ambiguous_permanent" : "no_evidence", smtp, codes);
}
