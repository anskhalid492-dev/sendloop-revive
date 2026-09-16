/**
 * Pure helpers for classifying mail read from a customer's own IMAP inbox.
 *
 * No I/O, no credentials: header/text parsing only, so it is fully unit-tested.
 */

const BOUNCE_SENDER_PATTERNS = [/mail\s*delivery\s*subsystem/i, /mailer-?daemon/i, /postmaster/i];

const BOUNCE_SUBJECT_PATTERNS = [
  /undelivered\s+mail/i,
  /delivery\s+status\s+notification/i,
  /mail\s+delivery\s+failed/i,
  /returned\s+mail/i,
];

/** `"Name" <a@b.c>` -> `a@b.c` (lower-cased). */
export function extractEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const angled = /<([^<>@\s]+@[^<>@\s]+)>/.exec(value);
  const candidate = angled?.[1] ?? /([^\s<>,;"]+@[^\s<>,;"]+)/.exec(value)?.[1] ?? null;
  return candidate ? candidate.trim().toLowerCase().replace(/[.,;]+$/, "") : null;
}

/** The display name in front of an address, when there is one. */
export function extractDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const withAngle = /^\s*(.*?)\s*<[^<>]+>\s*$/.exec(value);
  const name = (withAngle?.[1] ?? "").replace(/^["']|["']$/g, "").trim();
  return name.length > 0 ? name : null;
}

/** Splits a References header into individual message ids. */
export function splitReferences(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

/** True when the message is a delivery failure report rather than a real reply. */
export function looksLikeBounce(input: {
  from: string | null;
  subject: string | null;
}): boolean {
  const from = input.from ?? "";
  const subject = input.subject ?? "";
  if (BOUNCE_SENDER_PATTERNS.some((pattern) => pattern.test(from))) return true;
  return BOUNCE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

/**
 * The address the failed message was originally addressed to. Standard DSN
 * fields are trusted first; otherwise the first address in the report body that
 * is not the reporting mailbox itself.
 */
export function bouncedRecipient(input: {
  text: string | null;
  subject: string | null;
  mailbox: string;
}): string | null {
  const text = input.text ?? "";
  const mailbox = input.mailbox.trim().toLowerCase();

  const dsn =
    /final-recipient:\s*rfc822;\s*([^\s;]+@[^\s;]+)/i.exec(text)?.[1] ??
    /original-recipient:\s*rfc822;\s*([^\s;]+@[^\s;]+)/i.exec(text)?.[1] ??
    /x-failed-recipients:\s*([^\s,;]+@[^\s,;]+)/i.exec(text)?.[1] ??
    null;
  const fromDsn = extractEmail(dsn);
  if (fromDsn && fromDsn !== mailbox) return fromDsn;

  const candidates = `${text}\n${input.subject ?? ""}`.match(/[^\s<>",;:()[\]]+@[^\s<>",;:()[\]]+/g) ?? [];
  for (const candidate of candidates) {
    const email = extractEmail(candidate);
    if (!email) continue;
    if (email === mailbox) continue;
    // Report machinery, never the prospect.
    if (/^(mailer-daemon|postmaster|no-?reply)@/i.test(email)) continue;
    return email;
  }
  return null;
}
