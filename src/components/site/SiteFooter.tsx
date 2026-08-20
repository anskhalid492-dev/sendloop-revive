import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Facebook,
  FileText,
  Flame,
  Headphones,
  Heart,
  Inbox,
  LayoutGrid,
  Linkedin,
  Lock,
  Repeat,
  Send,
  ShieldCheck,
  Users,
  Youtube,
  Zap,
} from "lucide-react";

import { subscribeToNewsletter } from "@/lib/blog.functions";
import { useSiteContent } from "@/lib/page-seo";
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
      { label: "Why MunchReach", href: "/why-munchreach" },
    ],
  },
  {
    title: "Comparisons",
    links: [
      { label: "MunchReach vs Instantly", href: "/compare/munchreach-vs-instantly" },
      { label: "MunchReach vs Smartlead", href: "/compare/munchreach-vs-smartlead" },
      { label: "MunchReach vs lemlist", href: "/compare/munchreach-vs-lemlist" },
      { label: "MunchReach vs Apollo", href: "/compare/munchreach-vs-apollo" },
      { label: "MunchReach vs Saleshandy", href: "/compare/munchreach-vs-saleshandy" },
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

/** Small leading icons for the Product column, matched by link label. */
const productIcons: Record<string, typeof Send> = {
  Campaigns: Send,
  "Unified Inbox": Inbox,
  "Follow-Ups": Repeat,
  Warmup: Flame,
  Automations: Zap,
  CRM: Users,
  Analytics: BarChart3,
  Workspaces: LayoutGrid,
  Templates: FileText,
};

const socialIcons: Record<string, typeof Send> = {
  LinkedIn: Linkedin,
  YouTube: Youtube,
  Facebook: Facebook,
};

const trustSignals = [
  {
    icon: ShieldCheck,
    tone: "text-primary bg-primary/10",
    title: "Enterprise-Grade Security",
    body: "SOC 2-ready infrastructure and data protection.",
  },
  {
    icon: Zap,
    tone: "text-emerald-600 bg-emerald-500/10",
    title: "99.9% Uptime",
    body: "Reliable, fast & always available.",
  },
  {
    icon: Heart,
    tone: "text-violet-600 bg-violet-500/10",
    title: "Loved by 1000+ Teams",
    body: "Trusted by agencies, startups and enterprises.",
  },
  {
    icon: Headphones,
    tone: "text-amber-600 bg-amber-500/10",
    title: "Global Support",
    body: "Real humans, real fast support.",
  },
];

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.22-6.82-5.96 6.82H1.67l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64Z" />
    </svg>
  );
}

export function SiteFooter() {
  const content = useSiteContent();
  const subscribe = useServerFn(subscribeToNewsletter);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  const columns = (() => {
    const items = content?.footer ?? [];
    if (!items.length) return fallbackColumns;
    const groups = new Map<string, { label: string; href: string }[]>();
    for (const item of items) {
      const key = item.group_label || "More";
      groups.set(key, [...(groups.get(key) ?? []), { label: item.label, href: item.href }]);
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
    return sorted.map(([title, links]) => ({ title, links }));
  })();

  const social = content?.social?.length
    ? content.social.map((s) => ({ label: s.label, href: s.href }))
    : fallbackSocial;

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
        <div className="grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-16">
          {/* Brand + newsletter */}
          <div>
            <div className="flex items-center gap-3">
              <BrandLogo className="h-9 max-w-[220px]" alt={`${BRAND_NAME} logo`} />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{tagline}</p>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {social.map((s) => {
                const Icon = socialIcons[s.label];
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  >
                    {Icon ? <Icon className="size-4" /> : <XIcon className="size-4" />}
                  </a>
                );
              })}
            </div>

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
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-base font-semibold">{col.title}</h3>
                <span className="mt-2 block h-0.5 w-7 rounded-full bg-primary" />
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => {
                    const Icon = col.title === "Products" ? productIcons[l.label] : undefined;
                    return (
                      <li key={`${col.title}-${l.label}`}>
                        <a
                          href={l.href}
                          className="flex items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                        >
                          {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground/70" /> : null}
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

        {/* Trust bar */}
        <div className="mt-12 grid gap-6 rounded-2xl border border-border bg-muted/30 p-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
          {trustSignals.map((s) => (
            <div key={s.title} className="flex items-start gap-3 lg:px-5 lg:first:pl-0 lg:last:pr-0">
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", s.tone)}>
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
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
              <a href="/contact" className="transition-colors hover:text-primary">
                Contact
              </a>
              <a href="/help-center" className="transition-colors hover:text-primary">
                Help Center
              </a>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
            <span className="flex items-center gap-1.5 text-xs">
              <Lock className="size-3.5" /> Secure payments powered by
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">Stripe</span>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">Paddle</span>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">Lemon Squeezy</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
