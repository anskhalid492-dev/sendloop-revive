import { Send } from "lucide-react";

import { useSiteContent } from "@/lib/page-seo";

/**
 * Fallback footer. The live footer is managed in Admin → Footer; if that
 * content hasn't loaded yet (or fails to load) the site still renders these
 * links so no visitor ever sees an empty footer.
 */
const fallbackColumns = [
  {
    title: "Product",
    links: [
      { label: "Campaigns", href: "/product/campaigns" },
      { label: "Unified Inbox", href: "/product/unified-inbox" },
      { label: "Follow-Ups", href: "/product/follow-ups" },
      { label: "Warmup", href: "/product/warmup" },
      { label: "Automations", href: "/automations" },
      { label: "CRM", href: "/product/crm" },
      { label: "Analytics", href: "/product/analytics" },
      { label: "Workspaces", href: "/product/workspaces" },
      { label: "Templates", href: "/product/templates" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Documentation", href: "/docs" },
      { label: "API Documentation", href: "/api-docs" },
      { label: "Deliverability Guide", href: "/deliverability-guide" },
      { label: "Cold Email Templates", href: "/cold-email-templates" },
      { label: "Help Center", href: "/help-center" },
      { label: "Integrations", href: "/integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Pricing", href: "/pricing" },
      { label: "Customer Reviews", href: "/customer-reviews" },
      { label: "Referral Program", href: "/referral" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Acceptable Use Policy", href: "/acceptable-use" },
    ],
  },
];

const fallbackSocial = [
  { label: "LinkedIn", href: "#top" },
  { label: "YouTube", href: "#top" },
  { label: "X", href: "#top" },
  { label: "Facebook", href: "#top" },
];

export function SiteFooter() {
  const content = useSiteContent();

  const columns = (() => {
    const items = content?.footer ?? [];
    if (!items.length) return fallbackColumns;
    const groups = new Map<string, { label: string; href: string }[]>();
    for (const item of items) {
      const key = item.group_label || "More";
      groups.set(key, [...(groups.get(key) ?? []), { label: item.label, href: item.href }]);
    }
    return [...groups.entries()].map(([title, links]) => ({ title, links }));
  })();

  const social = content?.social?.length
    ? content.social.map((s) => ({ label: s.label, href: s.href }))
    : fallbackSocial;

  const tagline =
    content?.footerConfig?.tagline ??
    "Send personalized cold emails, automate follow-ups, and manage every reply from one workspace.";
  const copyright = content?.footerConfig?.copyright ?? "Sendloop. All rights reserved.";

  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div
        className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2"
        style={{ gridTemplateColumns: undefined }}
      >
        <div className="md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Send className="size-4" />
            </span>
            <span className="text-base font-bold tracking-tight">Sendloop</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">{tagline}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {social.map((s) => (
              <a key={s.label} href={s.href} className="transition-colors hover:text-foreground">
                {s.label}
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 md:col-span-2 lg:grid-cols-4">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={`${col.title}-${l.label}`}>
                    <a
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {copyright}
      </div>
    </footer>
  );
}
