/**
 * Client-safe email-provider classification.
 *
 * The provider is derived from the lead's actual email address domain
 * (case-insensitive, whitespace trimmed) — never from name or company.
 */
export type MailboxType = "google" | "outlook" | "other";

export const MAILBOX_TYPE_LABELS: Record<MailboxType, string> = {
  google: "Google",
  outlook: "Outlook",
  other: "Other",
};

export const MAILBOX_TYPE_ORDER: MailboxType[] = ["google", "outlook", "other"];

export const GOOGLE_EMAIL_DOMAINS = ["gmail.com", "googlemail.com"] as const;
export const OUTLOOK_EMAIL_DOMAINS = [
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
] as const;

/** Returns the lowercase domain part of an email address, or null. */
export function emailDomainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.trim().toLowerCase().slice(at + 1).trim();
  return domain || null;
}

/** Classifies a lead by its email address domain. */
export function emailProviderOf(email: string | null | undefined): MailboxType {
  const domain = emailDomainOf(email);
  if (!domain) return "other";
  if ((GOOGLE_EMAIL_DOMAINS as readonly string[]).includes(domain)) return "google";
  if ((OUTLOOK_EMAIL_DOMAINS as readonly string[]).includes(domain)) return "outlook";
  return "other";
}

const GOOGLE_HINTS = ["google", "gmail", "gsuite", "workspace"];
const OUTLOOK_HINTS = ["outlook", "microsoft", "office365", "o365", "m365", "exchange", "azure"];

/** Classifies a stored mailbox from its provider / connection method values. */
export function mailboxTypeOf(account: {
  provider?: string | null;
  connection_method?: string | null;
}): MailboxType {
  const haystack = `${account.provider ?? ""} ${account.connection_method ?? ""}`.toLowerCase();
  if (GOOGLE_HINTS.some((hint) => haystack.includes(hint))) return "google";
  if (OUTLOOK_HINTS.some((hint) => haystack.includes(hint))) return "outlook";
  return "other";
}
