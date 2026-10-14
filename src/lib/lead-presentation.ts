import { emailProviderOf, type MailboxType } from "@/lib/mailbox-type";

export const LEAD_PROVIDER_LABELS: Record<MailboxType, string> = {
  google: "Google Workspace",
  outlook: "Microsoft 365",
  other: "Other",
};

/** Presentation only: no hosting guesses or mailbox/account queries. */
export function leadProvider(email: string | null | undefined) {
  const type = emailProviderOf(email);
  return { type, label: LEAD_PROVIDER_LABELS[type] };
}

/** Open only an existing HTTP(S) profile value; never create a profile URL. */
export function leadLinkedInHref(value: string | null | undefined): string | null {
  const stored = value?.trim();
  if (!stored) return null;
  const href = /^https?:\/\//i.test(stored) ? stored : `https://${stored}`;
  try {
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) return null;
    return href;
  } catch {
    return null;
  }
}