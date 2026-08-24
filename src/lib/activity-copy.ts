/**
 * Customer-facing copy for activity feeds.
 *
 * Provider names, raw API responses and provider message ids stay in the
 * database and admin logs untouched — this module only decides what the
 * customer reads. Nothing here changes how events are recorded.
 */

const VENDORS =
  /\b(resend|sendgrid|mailgun|postmark|amazon ses|amazon|aws ses|ses|brevo|zeptomail|zoho|emailit|smtp|supabase|lovable|postgrest|openai)\b/gi;

/** True when the text leaks provider/API internals and must not be shown. */
export function mentionsVendor(text: string | null | undefined): boolean {
  if (!text) return false;
  VENDORS.lastIndex = 0;
  return VENDORS.test(text);
}

/** Pulls just the recipient address out of a provider log line, if present. */
export function recipientFrom(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : null;
}

export type SafeCopy = { title: string; detail: string };

const WARMUP_COPY: Record<string, SafeCopy> = {
  sent: { title: "Warmup Email Sent", detail: "Warmup email sent successfully" },
  delivered: { title: "Warmup Email Delivered", detail: "Warmup email reached the inbox" },
  opened: { title: "Warmup Email Opened", detail: "Warmup email was opened" },
  replied: { title: "Warmup Reply Received", detail: "A warmup reply came back" },
  scheduled: { title: "Warmup Email Scheduled", detail: "Warmup email queued for sending" },
  cancelled: { title: "Warmup Paused", detail: "Warmup sending was paused for this mailbox" },
  failed: {
    title: "Warmup Email Failed",
    detail: "We couldn't send this warmup email. Try again later.",
  },
  bounced: {
    title: "Warmup Email Failed",
    detail: "We couldn't deliver this warmup email. Try again later.",
  },
  not_received: {
    title: "Warmup Email Not Received",
    detail: "This warmup email hasn't arrived yet. We'll keep checking.",
  },
};

function titleCase(type: string) {
  const words = type.replace(/_/g, " ").trim();
  return words ? `Warmup ${words}` : "Warmup activity";
}

/**
 * Customer-safe title and detail for a warmup event.
 * `rawDetail` is only used when it carries no provider wording; when it does,
 * we fall back to plain MunchReach language plus the recipient address.
 */
export function warmupActivityCopy(
  type: string,
  rawDetail?: string | null,
  mailboxLabel?: string | null,
): SafeCopy {
  const base = WARMUP_COPY[type] ?? { title: titleCase(type), detail: "Warmup activity" };
  const recipient = recipientFrom(rawDetail);

  if (rawDetail && !mentionsVendor(rawDetail) && !recipient) {
    return { title: base.title, detail: rawDetail };
  }
  if (recipient && (type === "sent" || type === "delivered" || type === "scheduled")) {
    return { title: base.title, detail: `Sent to ${recipient}` };
  }
  if (recipient) {
    return { title: base.title, detail: `${base.detail} (${recipient})` };
  }
  return { title: base.title, detail: mailboxLabel ? `${base.detail} — ${mailboxLabel}` : base.detail };
}

/** Mailbox connection copy: "Michael was connected successfully." */
export function mailboxActivityCopy(label: string): SafeCopy {
  return { title: "Mailbox Connected", detail: `${label} was connected successfully.` };
}
