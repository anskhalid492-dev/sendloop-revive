import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  Crown,
  Compass,
  FileText,
  Flame,
  GraduationCap,
  Inbox,
  LifeBuoy,
  Mailbox,
  Menu,
  Plug,
  Send,
  PenLine,
  Sparkles,
  ShieldCheck,
  Users,
  Workflow,
  X,
  type LucideIcon,
  MessageSquareQuote,
  Gift,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { solutionNavLinks } from "@/lib/solutions-content";
import { useSiteContent } from "@/lib/page-seo";
import { communityPath } from "@/lib/community-model";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/lib/branding";

type Card = {
  label: string;
  to: string;
  text: string;
  icon: LucideIcon;
  cta?: string;
};

const featuredProducts: Card[] = [
  {
    label: "Campaigns",
    to: "/product/campaigns",
    text: "Create personalized cold email campaigns and automated follow-ups.",
    icon: Send,
    cta: "View Campaigns",
  },
  {
    label: "Unified Inbox",
    to: "/product/unified-inbox",
    text: "Manage every prospect reply from one powerful inbox.",
    icon: Inbox,
    cta: "Explore Unified Inbox",
  },
  {
    label: "Email Accounts",
    to: "/product/email-accounts",
    text: "Manage your MunchReach-powered sending accounts and monitor their health.",
    icon: Mailbox,
    cta: "View Email Accounts",
  },
  {
    label: "Warmup",
    to: "/product/warmup",
    text: "Monitor sender warmup and email health.",
    icon: Flame,
    cta: "Explore Warmup",
  },
  {
    label: "AI Writer",
    to: "/ai-campaign-writer",
    text: "Turn your offer into a full outreach campaign: strategy, messaging and sequence.",
    icon: PenLine,
    cta: "Explore AI Writer",
  },
  {
    label: "AI",
    to: "/ai-personalized-outreach",
    text: "Write a unique opening line for every prospect with your own OpenAI key.",
    icon: Sparkles,
    cta: "Explore AI Personalization",
  },
];

const secondaryProducts: Card[] = [
  {
    label: "Automations",
    to: "/automations",
    text: "Trigger follow-ups, CRM updates and tasks automatically.",
    icon: Workflow,
  },
  {
    label: "CRM",
    to: "/product/crm",
    text: "Manage contacts and sales conversations.",
    icon: Users,
  },
  {
    label: "Analytics",
    to: "/product/analytics",
    text: "Track campaign performance and replies.",
    icon: BarChart3,
  },
  {
    label: "Templates",
    to: "/product/templates",
    text: "Use proven cold email templates.",
    icon: FileText,
  },
  {
    label: "Workspaces",
    to: "/product/workspaces",
    text: "Manage teams and outreach.",
    icon: Building2,
  },
  {
    label: "Email Signature",
    to: "/product/email-signature",
    text: "Professional signatures for every mailbox and email.",
    icon: PenLine,
  },
];

const resourceCards: Card[] = [
  {
    label: "User Guide & Alerts",
    to: "/user-guide",
    text: "Product guides, incident notices and platform updates.",
    icon: GraduationCap,
  },
  {
    label: "Blog",
    to: "/blog",
    text: "Cold email strategies, sales and outreach insights.",
    icon: BookOpen,
  },
  {
    label: "Cold Email Templates",
    to: "/cold-email-templates",
    text: "Ready-to-use templates for different outreach campaigns.",
    icon: FileText,
  },
  {
    label: "Deliverability Guide",
    to: "/deliverability-guide",
    text: "Learn how to improve inbox placement.",
    icon: ShieldCheck,
  },
  {
    label: "Customer Reviews",
    to: "/customer-reviews",
    text: "See what MunchReach customers say about their outreach.",
    icon: MessageSquareQuote,
  },
  { label: "Documentation", to: "/docs", text: "Learn how MunchReach works.", icon: Compass },
  { label: "Help Center", to: "/help-center", text: "Get answers and support.", icon: LifeBuoy },
  {
    label: "Integrations",
    to: "/integrations",
    text: "Connect MunchReach to your CRM, Slack, Zapier and more.",
    icon: Plug,
  },
  {
    label: "Referral Program",
    to: "/referral",
    text: "Earn commission for every team you bring to MunchReach.",
    icon: Gift,
  },
  {
    label: "Why MunchReach",
    to: "/why-munchreach",
    text: "See why teams replace six outbound tools with one workspace.",
    icon: Compass,
  },
  {
    label: "How It Works",
    to: "/how-it-works",
    text: "The twelve steps from empty workspace to booked meetings.",
    icon: GraduationCap,
  },
  {
    label: "About MunchReach",
    to: "/about",
    text: "Our story, our team and where MunchReach is heading.",
    icon: BookOpen,
  },
];

/**
 * Icons are stored by name in the database so the menu can be edited without a
 * deploy. Unknown names fall back to a neutral icon rather than crashing.
 */
const ICONS: Record<string, LucideIcon> = {
  Send,
  Inbox,
  Mailbox,
  Flame,
  Workflow,
  Users,
  BarChart3,
  FileText,
  Building2,
  BookOpen,
  ShieldCheck,
  Compass,
  LifeBuoy,
  Plug,
  MessageSquareQuote,
  Gift,
  GraduationCap,
  Sparkles,
  PenLine,
};

type NavRow = {
  group_label: string | null;
  label: string;
  href: string;
  description: string | null;
  icon: string | null;
};

function toCards(rows: NavRow[], group: string, fallback: Card[]): Card[] {
  const scoped = rows.filter((r) => (r.group_label ?? "") === group);
  if (!scoped.length) return fallback;
  return scoped.map((r) => ({
    label: r.label,
    to: r.href,
    text: r.description ?? "",
    icon: (r.icon && ICONS[r.icon]) || Compass,
  }));
}

type MenuKey = "products" | "solutions" | "resources";

const panelMotion = {
  initial: { opacity: 0, y: -8, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.99 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const siteContent = useSiteContent();

  // Admin-managed menu, with the built-in menu as the fallback.
  const headerRows = (siteContent?.header ?? []) as NavRow[];
  const adminCoreCards = toCards(headerRows, "core", featuredProducts);
  const adminMoreCards = toCards(headerRows, "more", secondaryProducts);
  // AI Writer and AI Personalization belong to the core platform list,
  // so they always appear there even when the admin-managed menu leaves them out
  // or files them under "More from MunchReach".
  const guaranteedCoreCards: Card[] = [
    {
      label: "AI",
      to: "/ai-personalized-outreach",
      text: "Write a unique opening line for every prospect with your own OpenAI key.",
      icon: Sparkles,
      cta: "Explore AI Personalization",
    },
    {
      label: "AI Writer",
      to: "/ai-campaign-writer",
      text: "Turn your offer into a full outreach campaign: strategy, messaging and sequence.",
      icon: PenLine,
      cta: "Explore AI Writer",
    },
    {
      label: "AI Sales Agent",
      to: "/ai-sales-agent",
      text: "Let AI read replies, understand intent, draft responses and hand leads to your team.",
      icon: Sparkles,
      cta: "Explore AI Sales Agent",
    },
  ];
  const guaranteedHrefs = new Set(guaranteedCoreCards.map((c) => c.to));
  const emailSignatureCard: Card = {
    label: "Email Signature",
    to: "/product/email-signature",
    text: "Professional signatures for every mailbox and email.",
    icon: PenLine,
  };
  const moreCards = [
    ...adminMoreCards.filter(
      (c) => !guaranteedHrefs.has(c.to) && c.to !== emailSignatureCard.to,
    ),
    emailSignatureCard,
  ];
  // Every core product card gets a link to its own page, labelled after the product.
  const withCta = (card: Card): Card => ({
    ...card,
    cta: card.cta ?? `Explore ${card.label}`,
  });
  const coreCards = [
    ...adminCoreCards.filter((c) => !guaranteedHrefs.has(c.to)),
    ...guaranteedCoreCards,
  ].map(withCta);
  // The eight solution pages are the single source of truth for this menu, so
  // the navigation can never list an audience that has no page behind it.
  const useCaseLinks = solutionNavLinks.map((l) => ({
    label: l.label,
    to: l.to,
    text: l.text,
    icon: Compass,
  }));
  const baseResourceLinks = toCards(headerRows, "resources", resourceCards);
  // The Resources entry always points at the internal landing page — the
  // external destination lives behind its CTAs so we keep the visitor.
  const community = siteContent?.community;
  const resourceLinks =
    community?.enabled && community.show_in_nav
      ? [
          ...baseResourceLinks,
          {
            label: community.nav_label || "Community",
            to: communityPath(community),
            text: "Join other founders and outbound teams sharing wins and playbooks.",
            icon: Users,
          } satisfies Card,
        ]
      : baseResourceLinks;
  const topLinks = headerRows
    .filter((r) => (r.group_label ?? "") === "top")
    .map((r) => ({ label: r.label, to: r.href }));
  // Order: Products · Solutions · Pricing · Resources · Lifetime Deal.
  // Features keeps its page and its URL, but it lives in the footer under
  // Company rather than in the main navigation.
  const allTopNav = (topLinks.length ? topLinks : [{ label: "Pricing", to: "/pricing" }]).filter(
    (l) => l.to === "/pricing",
  );
  const midNav = allTopNav.length ? allTopNav : [{ label: "Pricing", to: "/pricing" }];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on route change, ESC, and outside click.
  useEffect(() => {
    setMenu(null);
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  // Hover intent: a short grace period prevents flicker between triggers.
  function openMenu(key: MenuKey) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMenu(key);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 140);
  }

  return (
    <header
      ref={headerRef}
      data-scrolled={scrolled || menu ? "true" : "false"}
      onMouseLeave={scheduleClose}
      className="sticky top-0 z-50 px-3 pb-2 pt-3 transition-all duration-300 sm:px-5"
    >
      <div
        className="mx-auto flex h-[4.25rem] w-full max-w-6xl items-center justify-between gap-4 rounded-full border border-border/60 bg-background/80 px-4 backdrop-blur-xl transition-all duration-300 data-[scrolled=true]:border-border data-[scrolled=true]:bg-background/95 data-[scrolled=true]:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] sm:px-6"
        data-scrolled={scrolled ? "true" : "false"}
      >
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label={BRAND_NAME}>
          <BrandLogo className="h-7 max-w-[168px]" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          <Trigger
            label="Products"
            active={menu === "products"}
            onOpen={() => openMenu("products")}
          />
          <Trigger
            label="Solutions"
            active={menu === "solutions"}
            onOpen={() => openMenu("solutions")}
          />
          {midNav.map((link) => (
            <TopLink key={link.to} to={link.to} label={link.label} onHover={() => setMenu(null)} />
          ))}
          <Trigger
            label="Resources"
            active={menu === "resources"}
            onOpen={() => openMenu("resources")}
          />
          <LifetimeDealLink onHover={() => setMenu(null)} />
        </nav>


        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {signedIn ? (
            <Button size="sm" asChild>
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/signin">Log in</Link>
              </Button>
              <Button size="sm" className="shadow-sm" asChild>
                <Link to="/signup">Get Started Free</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="inline-flex size-11 items-center justify-center rounded-md border border-border lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {/* Desktop mega menu */}
      <AnimatePresence>
        {menu ? (
          <motion.div
            {...panelMotion}
            onMouseEnter={() => openMenu(menu)}
            className="absolute inset-x-0 top-full hidden px-4 pb-6 lg:block"
          >
            <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-border/70 bg-background/98 shadow-[0_36px_80px_-40px_rgba(15,23,42,0.55)] backdrop-blur-xl">
              {menu === "products" ? (
                <ProductsPanel core={coreCards} more={moreCards} useCases={useCaseLinks} />
              ) : null}
              {menu === "solutions" ? <SolutionsPanel useCases={useCaseLinks} /> : null}
              {menu === "resources" ? <ResourcesPanel cards={resourceLinks} /> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 overflow-hidden rounded-3xl border border-border/70 bg-background shadow-[0_28px_60px_-30px_rgba(15,23,42,0.5)] lg:hidden"
          >
            <div className="mx-auto flex max-h-[calc(100dvh-7.5rem)] max-w-7xl flex-col gap-1 overflow-y-auto overscroll-contain px-4 py-4">

              <MobileGroup
                label="Products"
                cards={[...coreCards, ...moreCards]}
                onNavigate={() => setOpen(false)}
              />
              <MobileGroup
                label="Solutions"
                cards={useCaseLinks}
                onNavigate={() => setOpen(false)}
              />
              <MobileGroup
                label="Resources"
                cards={resourceLinks}
                onNavigate={() => setOpen(false)}
              />
              {midNav.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/lifetime"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex items-center gap-2 self-start rounded-full border border-primary/25 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary"
              >
                <Crown className="size-4 text-tint-amber-foreground" />
                Lifetime Deal
              </Link>

              <div className="mt-3 flex flex-col gap-2">
                {signedIn ? (
                  <Button asChild>
                    <Link to="/dashboard">Go to dashboard</Link>
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" asChild>
                      <Link to="/signin">Log in</Link>
                    </Button>
                    <Button asChild>
                      <Link to="/signup">Get Started Free</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function Trigger({
  label,
  active,
  onOpen,
}: {
  label: string;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onOpen}
      onFocus={onOpen}
      onClick={onOpen}
      aria-expanded={active}
      className={cn(
        "group inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <ChevronDown
        className={cn("size-3.5 transition-transform duration-200", active && "rotate-180")}
        aria-hidden="true"
      />
    </button>
  );
}

function TopLink({ to, label, onHover }: { to: string; label: string; onHover: () => void }) {
  return (
    <Link
      to={to}
      onMouseEnter={onHover}
      className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{ className: "text-foreground" }}
    >
      {label}
    </Link>
  );
}

function FeatureCard({ card }: { card: Card }) {
  const Icon = card.icon;
  return (
    <Link
      to={card.to}
      className="group relative flex flex-col gap-2 rounded-2xl border border-transparent bg-secondary/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-secondary/70 hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)]"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110">
        <Icon className="size-4" />
      </span>
      <span className="text-sm font-semibold">{card.label}</span>
      <span className="text-xs leading-relaxed text-muted-foreground">{card.text}</span>
      {card.cta ? (
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
          {card.cta}
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      ) : null}
    </Link>
  );
}

function CompactCard({ card }: { card: Card }) {
  const Icon = card.icon;
  return (
    <Link
      to={card.to}
      className="group flex items-start gap-3 rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-border/70 hover:bg-background hover:shadow-[0_14px_34px_-28px_rgba(15,23,42,0.6)]"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-semibold">
          {card.label}
          <ArrowRight className="size-3 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        {card.text ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {card.text}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function PanelHeading({ children }: { children: string }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function ProductsPanel({ core, more, useCases }: { core: Card[]; more: Card[]; useCases: Card[] }) {
  return (
    <div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <PanelHeading>Core platform</PanelHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            {core.map((card) => (
              <FeatureCard key={card.label} card={card} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-secondary/30 p-4">
          <PanelHeading>More from MunchReach</PanelHeading>
          <div className="grid gap-1">
            {more.map((card) => (
              <CompactCard key={card.label} card={card} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 bg-secondary/20 px-6 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          By use case
        </span>
        {useCases.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
          >
            {l.label}
          </Link>
        ))}
        <Link
          to="/solutions"
          className="text-xs font-semibold whitespace-nowrap text-primary transition-colors hover:underline"
        >
          View all solutions
        </Link>
      </div>
    </div>
  );
}

/**
 * Solutions mega menu. Every entry comes from the existing solution pages, so
 * the menu can never link to an audience that has no page behind it.
 */
function SolutionsPanel({ useCases }: { useCases: Card[] }) {
  return (
    <div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <PanelHeading>By use case</PanelHeading>
          <div className="grid gap-1 sm:grid-cols-2">
            {useCases.map((card) => (
              <CompactCard key={card.to} card={card} />
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-secondary/40 to-background p-5">
          <div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Users className="size-5" />
            </span>
            <h3 className="mt-4 text-base font-bold">Built for your team</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              See how agencies, sales teams, recruiters, founders and consultants run outreach in
              MunchReach — with the workflow that matches how your team works.
            </p>
          </div>
          <Button size="sm" className="mt-5 w-full" asChild>
            <Link to="/solutions">
              View all solutions
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResourcesPanel({ cards }: { cards: Card[] }) {
  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <PanelHeading>Learn &amp; support</PanelHeading>
        <div className="grid gap-1 sm:grid-cols-2">
          {cards.map((card) => (
            <CompactCard key={card.label} card={card} />
          ))}
        </div>
      </div>
      <div className="flex flex-col justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-secondary/40 to-background p-5">
        <div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <GraduationCap className="size-5" />
          </span>
          <h3 className="mt-4 text-base font-bold">Learn Cold Email</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Practical guides for building better outbound campaigns — from list building to
            deliverability and reply handling.
          </p>
        </div>
        <Button size="sm" className="mt-5 w-full" asChild>
          <Link to="/blog">
            Explore Resources
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function MobileGroup({
  label,
  cards,
  onNavigate,
}: {
  label: string;
  cards: Card[];
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary"
      >
        {label}
        <ChevronDown
          className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-3 flex flex-col border-l border-border/60 pl-2">
              {cards.map((card) => (
                <Link
                  key={`${label}-${card.label}`}
                  to={card.to}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <card.icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {card.label}
                </Link>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Highlighted top-nav entry for the Lifetime Deal offer.
 */
function LifetimeDealLink({ onHover }: { onHover: () => void }) {
  return (
    <Link
      to="/lifetime"
      onMouseEnter={onHover}
      className="ml-1 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/15"
    >
      <Crown className="size-4 text-tint-amber-foreground" />
      Lifetime Deal
    </Link>
  );
}
