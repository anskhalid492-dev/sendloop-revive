import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Facebook,
  FileText,
  Flame,
  Inbox,
  Instagram,
  LayoutGrid,
  Linkedin,

  Lock,
  Repeat,
  Send,
  Sparkles,
  Users,
  Youtube,
  Zap,
} from "lucide-react";

import { subscribeToNewsletter } from "@/lib/blog.functions";
import { useSiteContent } from "@/lib/page-seo";
import { communityPath } from "@/lib/community-model";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/lib/branding";

/**
 * Fallback footer. The live footer is managed in Admin → Footer; if that
 * content hasn't loaded yet (or fails to load) the site still renders these
 * links so no visitor ever sees an empty footer.
 */
const fallbackColumns = [
  {
    title: "Products",
    links: [
      { label: "Campaigns", href: "/product/campaigns" },
      { label: "AI Campaign Writer", href: "/products/ai-campaign-writer" },
      { label: "AI", href: "/ai-personalized-outreach" },
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
      { label: "All Resources", href: "/resources" },
      { label: "Blog", href: "/blog" },
      { label: "Documentation", href: "/docs" },
      { label: "API Documentation", href: "/api-docs" },
      { label: "Deliverability Guide", href: "/deliverability-guide" },
      { label: "Supported Domain & DNS Providers", href: "/supported-domain-providers" },
      { label: "Cold Email Templates", href: "/cold-email-templates" },
      { label: "Help Center", href: "/help-center" },
      { label: "Integrations", href: "/integrations" },
      { label: "Why MunchReach", href: "/why-munchreach" },
    ],
  },
  {
    title: "Comparisons",
    links: [
      { label: "vs Instantly", href: "/compare/munchreach-vs-instantly" },
      { label: "vs Smartlead", href: "/compare/munchreach-vs-smartlead" },
      { label: "vs lemlist", href: "/compare/munchreach-vs-lemlist" },
      { label: "vs Apollo", href: "/compare/munchreach-vs-apollo" },
      { label: "vs Saleshandy", href: "/compare/munchreach-vs-saleshandy" },
      { label: "MunchReach Alternatives", href: "/compare/munchreach-alternatives" },
    ],
  },
  {
    title: "Company",
    links: [
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
      { label: "Sending Policy", href: "/legal/sending-policy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "Acceptable Use", href: "/acceptable-use" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "DPA", href: "/dpa" },
      { label: "Remove My Data", href: "/remove-my-data" },
      { label: "Compliance", href: "/compliance" },
    ],
  },
];

/** A social link only renders when staff have entered a real destination. */
function hasRealHref(href: string | null | undefined) {
  const value = (href ?? "").trim();
  if (!value || value === "#" || value === "#top") return false;
  return /^https?:\/\/\S+\.\S+/.test(value);
}


/** Small leading icons for the Product column, matched by link label. */
const productIcons: Record<string, typeof Send> = {
  Campaigns: Send,
  AI: Sparkles,
  "AI Personalization": Sparkles,
  "Unified Inbox": Inbox,
  "Follow-Ups": Repeat,
  Warmup: Flame,
  Automations: Zap,
  CRM: Users,
  Analytics: BarChart3,
  Workspaces: LayoutGrid,
  Templates: FileText,
};

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.22-6.82-5.96 6.82H1.67l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64Z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.32 4.57A19.8 19.8 0 0 0 15.44 3l-.24.45c1.63.4 2.98 1.04 4.2 1.9a13.9 13.9 0 0 0-11.02-.44c-.35.14-.7.29-1.02.44.94-.67 2.1-1.3 3.6-1.75L10.63 3c-1.4.18-3.2.7-4.95 1.57C3.5 8.34 2.6 12.72 3.03 17.53a17.4 17.4 0 0 0 5.4 2.47l1.1-1.5c-.94-.32-1.8-.72-2.6-1.24.22-.15.43-.3.63-.46a12.4 12.4 0 0 0 10.87 0c.2.17.42.32.64.47-.8.51-1.66.91-2.6 1.23l1.09 1.5a17.4 17.4 0 0 0 5.4-2.47c.5-5.4-.85-9.74-2.64-12.96ZM8.98 15.13c-1.05 0-1.92-.96-1.92-2.14 0-1.19.85-2.15 1.92-2.15s1.94.97 1.92 2.15c0 1.18-.85 2.14-1.92 2.14Zm7.07 0c-1.06 0-1.92-.96-1.92-2.14 0-1.19.85-2.15 1.92-2.15s1.93.97 1.91 2.15c0 1.18-.84 2.14-1.91 2.14Z" />
    </svg>
  );
}

const SOCIAL_ORDER = ["X", "Instagram", "YouTube", "LinkedIn", "Facebook", "Discord"];

const socialIcons: Record<string, (props: { className?: string }) => React.ReactElement> = {
  X: XIcon,
  Instagram: (props) => <Instagram {...props} />,
  YouTube: (props) => <Youtube {...props} />,
  LinkedIn: (props) => <Linkedin {...props} />,
  Facebook: (props) => <Facebook {...props} />,
  Discord: DiscordIcon,
};


export function SiteFooter() {
  const content = useSiteContent();
  const subscribe = useServerFn(subscribeToNewsletter);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  const columns = (() => {
    const community = content?.community;
    // The footer entry links to the internal landing page, matching the header.
    const withCommunity = (cols: { title: string; links: { label: string; href: string }[] }[]) => {
      if (!community?.enabled || !community.show_in_footer) return cols;
      const entry = {
        label: community.footer_label || community.nav_label || "Community",
        href: communityPath(community),
      };
      const index = cols.findIndex((c) => c.title.toLowerCase() === "resources");
      if (index === -1) return [...cols, { title: "Resources", links: [entry] }];
      return cols.map((c, i) => (i === index ? { ...c, links: [...c.links, entry] } : c));
    };

    const items = content?.footer ?? [];
    if (!items.length) return withCommunity(fallbackColumns);
    const groups = new Map<string, { label: string; href: string }[]>();
    for (const item of items) {
      const key = item.group_label || "More";
      const links = groups.get(key) ?? [];
      // Admin-managed navigation can contain duplicate rows. Render each
      // destination once so repeated records never create repeated footer links.
      if (!links.some((link) => link.href === item.href)) {
        groups.set(key, [...links, { label: item.label, href: item.href }]);
      }
    }
    // Compliance and Sending Policy are platform rule pages and must always
    // appear under Legal, in the documented order, even if the CMS list omits them.
    let legal = groups.get("Legal") ?? [];
    if (!legal.some((l) => l.href === "/legal/sending-policy")) {
      const privacyIndex = legal.findIndex((l) => l.href === "/privacy");
      const entry = { label: "Sending Policy", href: "/legal/sending-policy" };
      legal =
        privacyIndex === -1
          ? [entry, ...legal]
          : [...legal.slice(0, privacyIndex + 1), entry, ...legal.slice(privacyIndex + 1)];
      groups.set("Legal", legal);
    }
    if (!legal.some((l) => l.href === "/compliance")) {
      groups.set("Legal", [...legal, { label: "Compliance", href: "/compliance" }]);
    }
    const order = ["Products", "Resources", "Comparisons", "Company", "Legal"];
    const sorted = [...groups.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return withCommunity(sorted.map(([title, links]) => ({ title, links })));
  })();

  // Fixed platform order; only enabled links with a real URL reach this list.
  const social = (content?.social ?? [])
    .filter((s) => hasRealHref(s.href))
    .map((s) => ({ label: s.label, href: s.href.trim() }))
    .sort((a, b) => {
      const ai = SOCIAL_ORDER.indexOf(a.label);
      const bi = SOCIAL_ORDER.indexOf(b.label);
      if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });


  const tagline =
    content?.footerConfig?.tagline ??
    "Send personalized cold emails, automate follow-ups, and manage every reply from one workspace.";
  const copyright = content?.footerConfig?.copyright ?? "MunchReach. All rights reserved.";

  const onSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || pending) return;
    setPending(true);
    setState(null);
    try {
      const res = await subscribe({ data: { email: email.trim(), source: "footer" } });
      setState({ kind: res.ok ? "success" : "error", message: res.message });
      if (res.ok) setEmail("");
    } catch {
      setState({ kind: "error", message: "Could not subscribe right now. Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <footer className="border-t border-border bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-20">
          {/* Brand + newsletter */}
          <div>
            <div className="flex items-center gap-3">
              <BrandLogo className="h-9 max-w-[220px]" alt={`${BRAND_NAME} logo`} />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{tagline}</p>

            {social.length ? (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {social.map((s) => {
                  const Icon = socialIcons[s.label] ?? ((p: { className?: string }) => <Send {...p} />);
                  return (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={s.label}
                      className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    >
                      <Icon className="size-4" />
                    </a>
                  );
                })}
              </div>
            ) : null}


            <div className="mt-7 rounded-2xl border border-border bg-muted/30 p-5">
              <h3 className="text-base font-semibold">Stay in the loop</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get cold email tips, product updates, and growth strategies.
              </p>
              <form onSubmit={onSubscribe} className="mt-4 flex">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  aria-label="Email address"
                  className="h-11 w-full rounded-l-lg border border-r-0 border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={pending}
                  aria-label="Subscribe"
                  className="flex h-11 w-14 items-center justify-center rounded-r-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <ArrowRight className="size-4" />
                </button>
              </form>
              {state ? (
                <p
                  className={cn(
                    "mt-2 text-xs",
                    state.kind === "success" ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {state.message}
                </p>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" /> No spam. Unsubscribe anytime.
                </p>
              )}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold uppercase tracking-wide">{col.title}</h3>
                <span className="mt-2 block h-0.5 w-7 rounded-full bg-primary" />
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => {
                    const Icon = col.title === "Products" ? productIcons[l.label] : undefined;
                    return (
                      <li key={`${col.title}-${l.label}`}>
                        <a
                          href={l.href}
                          className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground transition-colors hover:text-primary"
                        >
                          {Icon ? (
                            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
                          ) : null}
                          {l.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
            <p className="text-muted-foreground">
              © {new Date().getFullYear()} {copyright}
            </p>
            <nav className="flex flex-wrap gap-5 text-muted-foreground">
              <a href="/pricing" className="transition-colors hover:text-primary">
                Pricing
              </a>
              <a href="/help-center" className="transition-colors hover:text-primary">
                Help Center
              </a>
              <a href="/compliance" className="transition-colors hover:text-primary">
                Compliance
              </a>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
            <span className="flex items-center gap-1.5 text-xs">
              <Lock className="size-3.5" /> Secure payments powered by
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">Stripe</span>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">Paddle</span>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">
              Lemon Squeezy
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
