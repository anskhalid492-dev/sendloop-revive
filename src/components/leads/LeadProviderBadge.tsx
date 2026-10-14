import { MailboxTypeIcon } from "@/components/campaign/MailboxTypeBadge";
import { leadProvider } from "@/lib/lead-presentation";

export function LeadProviderBadge({ email }: { email: string }) {
  const provider = leadProvider(email);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-foreground">
      <MailboxTypeIcon type={provider.type} />
      {provider.label}
    </span>
  );
}