import { Mail } from "lucide-react";

import { BrandGlyph } from "@/components/site/BrandGlyph";
import { MAILBOX_TYPE_LABELS, type MailboxType } from "@/lib/mailbox-type";

/** Microsoft's four-square mark, used for Outlook / Microsoft 365 mailboxes. */
function MicrosoftMark({ className }: { className?: string }) {
  return (
    <svg role="img" aria-label="Outlook" viewBox="0 0 24 24" className={className}>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export function MailboxTypeIcon({ type }: { type: MailboxType }) {
  if (type === "google") return <BrandGlyph brand="google" className="size-3.5 shrink-0" />;
  if (type === "outlook") return <MicrosoftMark className="size-3.5 shrink-0" />;
  return <Mail className="size-3.5 shrink-0 text-muted-foreground" />;
}

/** Compact mailbox-type marker used in the campaign leads table. */
export function MailboxTypeBadge({ type }: { type: MailboxType }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <MailboxTypeIcon type={type} />
      {MAILBOX_TYPE_LABELS[type]}
    </span>
  );
}
