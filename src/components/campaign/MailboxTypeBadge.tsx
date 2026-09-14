import { Mail } from "lucide-react";

import { BrandGlyph } from "@/components/site/BrandGlyph";
import { MAILBOX_TYPE_LABELS, type MailboxType } from "@/lib/mailbox-type";

/** Compact mailbox-type marker used in the campaign leads table. */
export function MailboxTypeBadge({ type }: { type: MailboxType }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <MailboxTypeIcon type={type} />
      {MAILBOX_TYPE_LABELS[type]}
    </span>
  );
}

export function MailboxTypeIcon({ type }: { type: MailboxType }) {
  if (type === "google") return <BrandGlyph brand="google" className="size-3.5 shrink-0" />;
  if (type === "outlook")
    return <BrandGlyph brand="microsoftoutlook" className="size-3.5 shrink-0" />;
  return <Mail className="size-3.5 shrink-0 text-muted-foreground" />;
}
