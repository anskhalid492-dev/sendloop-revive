/**
 * Provider marks for the mailbox connection flow.
 *
 * Each logo is the provider's own official mark, bundled with the app so the
 * cards never depend on a third-party image host at render time. Custom Domain
 * has no company behind it, so it uses a neutral server glyph.
 */
import { Globe } from "lucide-react";

import godaddyLogo from "@/assets/providers/godaddy.png";
import hostingerLogo from "@/assets/providers/hostinger.png";
import namecheapLogo from "@/assets/providers/namecheap.png";
import porkbunLogo from "@/assets/providers/porkbun.png";
import yahooLogo from "@/assets/providers/yahoo.png";
import zohoLogo from "@/assets/providers/zoho.png";
import type { MailboxProviderId } from "@/lib/mailbox-providers";

const LOGOS: Partial<Record<MailboxProviderId, string>> = {
  zoho: zohoLogo,
  hostinger: hostingerLogo,
  porkbun: porkbunLogo,
  godaddy: godaddyLogo,
  namecheap: namecheapLogo,
  yahoo: yahooLogo,
};

export function ProviderLogo({
  provider,
  name,
  className = "size-6",
}: {
  provider: MailboxProviderId;
  name: string;
  className?: string;
}) {
  const src = LOGOS[provider];
  if (!src) {
    return <Globe className={`${className} text-muted-foreground`} strokeWidth={1.75} aria-hidden />;
  }
  return (
    <img
      src={src}
      alt={`${name} logo`}
      loading="lazy"
      decoding="async"
      className={`${className} shrink-0 object-contain`}
    />
  );
}
