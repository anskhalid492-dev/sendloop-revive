/**
 * Bounce reasons, in one place.
 *
 * The provider's own text is stored on the message and the recipient
 * (`bounce_reason`), but it is never shown raw to a customer: vendor names,
 * endpoints and keys are redacted first, then the text is classified into a
 * short human label so the campaign page can say *why* a bounce happened.
 *
 * Client-safe: no server imports, so the same rule runs in the UI and on the
 * server and cannot drift into two versions.
 */

/** Vendor identity, endpoints and credentials never reach a customer. */
const VENDOR =
  /\b(resend|sendgrid|mailgun|postmark|zeptomail|zoho|brevo|emailit|maileroo|nuntly|elastic ?email|courier|uspeedo|amazon ses|aws ses|\bses\b|supabase|lovable)\b/gi;
const SECRETS = /\b(api[_ -]?key|sending[_ -]?key)\b\s*[:=]?\s*\S*/gi;
const URLS = /https?:\/\/\S+/gi;

export function redactBounceReason(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const clean = text
    .replace(URLS, "")
    .replace(SECRETS, "")
    .replace(VENDOR, "the mail server")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean.length ? clean.slice(0, 300) : null;
}

export type BounceCategory =
  | "mailbox_not_found"
  | "mailbox_full"
  | "blocked"
  | "spam_complaint"
  | "domain_not_found"
  | "message_rejected"
  | "unknown";

export const BOUNCE_CATEGORY_LABELS: Record<BounceCategory, string> = {
  mailbox_not_found: "Address does not exist",
  mailbox_full: "Mailbox full",
  blocked: "Blocked by the receiving server",
  spam_complaint: "Marked as spam",
  domain_not_found: "Domain does not exist",
  message_rejected: "Message rejected",
  unknown: "Bounced",
};

/** The SMTP status code the receiving server replied with, when present. */
export function bounceCode(raw: string | null | undefined): string | null {
  const text = raw ?? "";
  const enhanced = text.match(/\b([45]\.\d{1,3}\.\d{1,3})\b/);
  if (enhanced) return enhanced[1]!;
  const basic = text.match(/\b([45]\d{2})\b/);
  return basic ? basic[1]! : null;
}

export function classifyBounce(raw: string | null | undefined): BounceCategory {
  const text = (raw ?? "").toLowerCase();
  if (!text) return "unknown";
  if (/(user|recipient|mailbox|address)[^.]{0,20}(unknown|not exist|no longer|not found|invalid|rejected)/.test(text))
    return "mailbox_not_found";
  if (/no such user|does not exist|unknown user|5\.1\.1|550 5\.1\.1|recipient address rejected/.test(text))
    return "mailbox_not_found";
  if (/(mailbox|quota)[^.]{0,20}(full|exceeded)|over quota|insufficient storage|4\.2\.2|5\.2\.2/.test(text))
    return "mailbox_full";
  if (/spam|complaint|abuse|blacklist|blocklist|reputation/.test(text)) return "spam_complaint";
  if (/block|denied|not allowed|policy|reject.*polic|access denied|5\.7\./.test(text)) return "blocked";
  if (/(domain|host)[^.]{0,20}(not found|unknown|does not exist)|nxdomain|no mx|dns/.test(text))
    return "domain_not_found";
  if (/reject|refused|undeliverable|failed permanently/.test(text)) return "message_rejected";
  return "unknown";
}

export type BounceExplanation = {
  category: BounceCategory;
  /** Short human label, e.g. "Address does not exist". */
  label: string;
  /** SMTP code the receiving server replied with, e.g. "550" or "5.1.1". */
  code: string | null;
  /** Redacted provider text, safe to show. */
  detail: string | null;
};

export function explainBounce(raw: string | null | undefined): BounceExplanation {
  const detail = redactBounceReason(raw);
  const category = classifyBounce(detail ?? raw);
  return { category, label: BOUNCE_CATEGORY_LABELS[category], code: bounceCode(detail ?? raw), detail };
}
