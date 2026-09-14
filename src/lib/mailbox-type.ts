/**
 * Client-safe mailbox-type classification.
 *
 * The type is derived from the real stored mailbox record (its provider and
 * connection method) — never from the lead's email domain.
 */
export type MailboxType = "google" | "outlook" | "other";

export const MAILBOX_TYPE_LABELS: Record<MailboxType, string> = {
  google: "Google Workspace",
  outlook: "Outlook",
  other: "Other",
};

export const MAILBOX_TYPE_ORDER: MailboxType[] = ["google", "outlook", "other"];

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
