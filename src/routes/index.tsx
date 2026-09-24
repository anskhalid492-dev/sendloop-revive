import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Check,
  Flame,
  Inbox,
  Layers,
  PlayCircle,
  Repeat,
  Send,
  Sparkles,
  Upload,
  Users,
  Workflow,
} from "lucide-react";

import { HeroProductVisual } from "@/components/site/HeroProductVisual";
import { Reveal } from "@/components/site/Reveal";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";
import { AiPersonalizationScreen } from "@/components/site/AiPersonalizationProductMocks";
import { SequenceMock } from "@/components/site/CampaignsProductMocks";
import { CrmTableMock } from "@/components/site/CrmProductMocks";
import { WarmupDashboardMock } from "@/components/site/WarmupProductMocks";
import { Button } from "@/components/ui/button";
import { InboxSection, StackSection, WorkspaceSection } from "@/components/site/HomeSections";
import dashboardOverviewAsset from "@/assets/munchreach-dashboard-overview.jpg.asset.json";
import sequencesAsset from "@/assets/sequences-mockup.jpg.asset.json";
import analyticsAsset from "@/assets/analytics-2.jpg.asset.json";
import automationsAsset from "@/assets/automations-mockup.jpg.asset.json";
import aiPersonalizationAsset from "@/assets/ai-personalization-mockup.jpg.asset.json";
import { applySeoOverrides } from "@/lib/page-seo";
import { SITE_URL } from "@/lib/seo";

const faqs = [
  {
    q: "What is MunchReach?",
    a: "MunchReach is a workspace for running B2B cold email. You import your prospects, build multi-step campaigns, personalize messages, follow up automatically, and manage replies, CRM stages, and analytics in one place.",
  },
  {
    q: "How does MunchReach work?",
    a: "Create a workspace, connect your mailbox, import prospects from a CSV, build a campaign with follow-up steps and a sending schedule, then launch. Replies land in the Unified Inbox and move into your CRM.",
  },
  {
    q: "Do I need my own mailbox?",
    a: "Yes. Campaigns send from mailboxes you connect to your workspace. MunchReach does not sell mailboxes or send on a shared address for you.",
  },
  {
    q: "Can I connect Gmail or Google Workspace?",
    a: "Yes. You can connect Gmail and Google Workspace mailboxes from the Email Accounts page.",
  },
  {
    q: "Can I connect Microsoft 365 or Outlook?",
    a: "Yes. Microsoft 365 and Outlook mailboxes can be connected from the Email Accounts page.",
  },
  {
    q: "Can I connect IMAP/SMTP mailboxes?",
    a: "Yes. Any provider that supports IMAP and SMTP can be connected with its server details, so you can send and receive replies from it.",
  },
  {
    q: "How do I import leads?",
    a: "Upload a CSV, map its columns to lead fields, and MunchReach handles duplicates during the import. Leads are organized into lists you can filter and update in bulk.",
  },
  {
    q: "Can I automate follow-ups?",
    a: "Yes. Add follow-up steps with your own delays. They send automatically within your sending window and stop when a prospect replies.",
  },
  {
    q: "How does AI personalization work?",
    a: "Use lead variables like first name, company, and industry in your emails, and let the AI campaign writer draft personalized copy you can review and edit before sending.",
  },
  {
    q: "Can I use Claude for AI personalization?",
    a: "Yes. You can add your own OpenAI or Claude key to your workspace. The key is stored encrypted, and AI drafts are never sent without your review.",
  },
  {
    q: "How does warmup work?",
    a: "Warmup gradually builds sending activity on your connected mailboxes, tracks mailbox health, and warns you about deliverability problems. It improves your odds but cannot guarantee inbox placement.",
  },
  {
    q: "Can I manage replies in one inbox?",
    a: "Yes. Replies from every connected mailbox land in the Unified Inbox, where you can classify them, assign them to teammates, add internal notes, and see the full conversation history.",
  },
  {
    q: "Does MunchReach include CRM?",
    a: "Yes. Contacts move through pipeline stages from New to Won or Lost. Stages stay in sync with the inbox and are linked to the conversation that created them.",
  },
  {
    q: "How does pricing work?",
    a: "Start with a 14-day free trial, then choose a monthly or yearly plan. Yearly plans are 20% off. Full details are on the pricing page.",
  },
];

const problems = [
  "I'm using too many tools to run outbound.",
  "Personalizing every email takes forever.",
  "Follow-ups are easy to forget.",
  "Replies are scattered across different inboxes.",
  "I can't clearly see which campaigns are actually working.",
  "My outreach data lives in too many places.",
];

const flow = ["Leads", "Campaigns", "AI Campaign Writer", "Follow-ups", "Sending", "Replies", "CRM", "Analytics"];

const howItWorks = [
  { n: "01", title: "Create your workspace", text: "Name it, invite your team, and connect your mailbox." },
  { n: "02", title: "Import your prospects", text: "Upload a CSV, map the fields, and skip duplicates." },
  { n: "03", title: "Build your campaign", text: "Write the first email, then add follow-up steps and a schedule." },
  { n: "04", title: "Launch and manage replies", text: "Emails send on schedule. Replies land in one inbox." },
];

const audiences: { label: string; slug?: string }[] = [
  { label: "Agencies", slug: "agencies" },
  { label: "Sales Teams", slug: "sales-teams" },
  { label: "SaaS Companies", slug: "saas" },
  { label: "Recruiting", slug: "recruiting" },
  { label: "Consultants", slug: "consultants" },
  { label: "Founders", slug: "founders" },
  { label: "Marketing Agencies", slug: "marketing-agencies" },
  { label: "B2B Service Companies" },
];

const showcase = [
  { id: "dashboard", label: "Dashboard", src: dashboardOverviewAsset.url, alt: "MunchReach dashboard overview" },
  { id: "sequences", label: "Sequences", src: sequencesAsset.url, alt: "MunchReach sequence builder" },
  { id: "ai", label: "AI Personalization", src: aiPersonalizationAsset.url, alt: "MunchReach AI personalization" },
  { id: "automations", label: "Automations", src: automationsAsset.url, alt: "MunchReach automations builder" },
  { id: "analytics", label: "Analytics", src: analyticsAsset.url, alt: "MunchReach analytics dashboard" },
];

const HOME_TITLE = "MunchReach | AI Cold Emailing Platform for Agencies";
const HOME_DESCRIPTION =
  "Import prospects, build personalized cold email campaigns, automate follow-ups, and manage replies, CRM, and analytics in one outbound workspace.";

export const Route = createFileRoute("/")({
  head: () =>
    applySeoOverrides("/", {
      meta: [
        { title: HOME_TITLE },
        { name: "description", content: HOME_DESCRIPTION },
        { property: "og:title", content: HOME_TITLE },
        { property: "og:description", content: HOME_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: SITE_URL },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: HOME_TITLE },
        { name: "twitter:description", content: HOME_DESCRIPTION },
      ],
      links: [{ rel: "canonical", href: SITE_URL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "MunchReach",
            url: SITE_URL,
            logo: `${SITE_URL}/favicon.png`,
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "MunchReach", url: SITE_URL }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    }),
  component: Home,
});

/* ------------------------------------------------------------ primitives */

function Eyebrow({ children }: { children: string }) {
  return <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">{children}</span>;
}

function SectionHead({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h2>
      {description ? <p className="mt-4 text-lg text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_30px_60px_-40px_color-mix(in_oklab,var(--foreground)_35%,transparent)]">
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FrameImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Frame>
      <img src={src} alt={alt} loading="lazy" className="block h-auto w-full" />
    </Frame>
  );
}

function FeatureStory({
  id,
  label,
  title,
  body,
  benefits,
  cta,
  visual,
  reverse = false,
}: {
  id: string;
  label: string;
  title: string;
  body: string;
  benefits: string[];
  cta?: { to: string; text: string };
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal className={reverse ? "lg:order-2" : ""}>
          <Eyebrow>{label}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{body}</p>
          <ul className="mt-6 space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm sm:text-base">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Check className="size-3" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          {cta ? (
            <Button variant="outline" className="group mt-8 rounded-xl" asChild>
              <Link to={cta.to}>
                {cta.text}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          ) : null}
        </Reveal>
        <Reveal delay={120} className={`min-w-0 ${reverse ? "lg:order-1" : ""}`}>
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

function LeadListMock() {
  const rows = [
    { name: "First Name, Last Name", company: "Company", status: "New" },
    { name: "First Name, Last Name", company: "Company", status: "Contacted" },
    { name: "First Name, Last Name", company: "Company", status: "Replied" },
    { name: "First Name, Last Name", company: "Company", status: "Interested" },
  ];
  return (
    <Frame>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Lead list</p>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1 text-xs">
            <Upload className="size-3.5 text-primary" /> Import CSV
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-dashed border-border p-3 text-[0.7rem] text-muted-foreground">
          <span>email → Email</span>
          <span>company → Company</span>
          <span>Duplicates skipped</span>
        </div>
        <div className="mt-4 divide-y divide-border/60 rounded-xl border border-border/60">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <span className="truncate font-medium">{r.name}</span>
              <span className="hidden truncate text-muted-foreground sm:block">{r.company}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function TrustpilotMark() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#00B67A" d="M12 1.5l2.9 7.6H23l-6.5 4.8 2.5 7.8L12 16.9l-7 4.8 2.5-7.8L1 9.1h8.1z" />
      </svg>
      Trustpilot
    </span>
  );
}

function CapterraMark() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#FF9D28" d="M2 9.5l9.2 0 2.8-8.5-12 8.5z" />
        <path fill="#68C5ED" d="M14 1l-2.8 8.5H22z" />
        <path fill="#044D80" d="M11.2 9.5L22 9.5 8 23z" />
        <path fill="#E54747" d="M2 9.5h9.2L8 23z" />
      </svg>
      Capterra
    </span>
  );
}

function ShowcaseTabs() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((p) => (p + 1) % showcase.length), 5000);
    return () => window.clearInterval(id);
  }, []);
  const current = showcase[active]!;
  return (
    <div>
      <div role="tablist" className="mx-auto flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card p-1 sm:w-fit">
        {showcase.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              i === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-8">
        <div key={current.id} className="animate-in fade-in duration-500">
          <FrameImage src={current.src} alt={current.alt} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

function Home() {
  return (
    <div id="top" className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_7%,transparent),transparent_70%)]"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[45fr_55fr] lg:pt-24 lg:pb-24">
            <div className="text-center lg:text-left">
              <Eyebrow>The all-in-one cold outreach platform</Eyebrow>
              <h1 className="mt-5 text-[2.3rem] font-extrabold leading-[1.05] tracking-tight text-balance sm:text-[3.2rem] lg:text-[3.6rem]">
                Your Next Customer Could Be <span className="text-primary">One Email Away.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
                Find the right prospects, personalize every message, automate follow-ups, and manage replies, all from
                one simple outbound platform.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
                <Button size="lg" className="rounded-xl px-7" asChild>
                  <Link to="/signup">
                    Start Sending Free
                    <Send className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-xl bg-card px-7" asChild>
                  <a href="#how-it-works">
                    See How It Works
                    <PlayCircle className="size-4" />
                  </a>
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                14-day free trial · No credit card required · Cancel anytime
              </p>
            </div>
            <div className="min-w-0">
              <HeroProductVisual />
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-border/60">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-4 py-6 text-muted-foreground sm:flex-row sm:gap-10 sm:px-6">
            <span className="text-xs font-medium tracking-[0.18em] uppercase">Find MunchReach on</span>
            <div className="flex items-center gap-8 text-foreground/80">
              <a href="https://www.trustpilot.com/review/munchreach.com" target="_blank" rel="noopener noreferrer" aria-label="MunchReach on Trustpilot" className="transition-opacity hover:opacity-70"><TrustpilotMark /></a>
              <a href="https://www.capterra.com/p/10186302/MunchReach/pricing/" target="_blank" rel="noopener noreferrer" aria-label="MunchReach on Capterra" className="transition-opacity hover:opacity-70"><CapterraMark /></a>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <Reveal>
            <SectionHead eyebrow="The problem" title="Running Outbound Shouldn't Feel This Scattered" />
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {problems.map((p, i) => (
              <Reveal key={p} delay={i * 60}>
                <blockquote className="h-full rounded-2xl border border-border/70 bg-card p-6 text-lg font-medium leading-snug">
                  <span className="text-primary">“</span>
                  {p}
                  <span className="text-primary">”</span>
                </blockquote>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-16 text-center text-2xl font-bold tracking-tight sm:text-4xl">
              One workspace. <span className="text-primary">One outbound workflow.</span>
            </p>
          </Reveal>
        </section>

        {/* Solution flow */}
        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHead
                eyebrow="How MunchReach fits together"
                title="From First Import to Closed Deal"
                description="Every step of outbound runs in the same workspace, on the same data."
              />
            </Reveal>
            <ol className="mt-12 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {flow.map((f, i) => (
                <li key={f} className="flex items-center gap-2 sm:gap-3">
                  <span className="rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium shadow-sm sm:px-4">
                    <span className="mr-2 text-xs text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    {f}
                  </span>
                  {i < flow.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" /> : null}
                </li>
              ))}
            </ol>
            <Reveal className="mt-14">
              <FrameImage src={dashboardOverviewAsset.url} alt="MunchReach dashboard overview with sends, replies and blockers on one screen" />
            </Reveal>
          </div>
        </section>

        {/* Feature stories */}
        <FeatureStory
          id="leads"
          label="Lead management"
          title="Bring Your Prospects Into One Workspace"
          body="Import the prospects you already have and keep them organized. Map CSV columns to lead fields, drop duplicates, and track every lead's status as it moves through your outreach."
          benefits={["CSV import with field mapping", "Duplicate handling on import", "Lead lists and lead statuses", "Bulk actions across selected leads"]}
          cta={{ to: "/features", text: "Explore Lead Management" }}
          visual={<LeadListMock />}
        />
        <FeatureStory
          id="campaigns"
          reverse
          label="Campaigns & sequences"
          title="Build Outreach Campaigns Without The Busywork"
          body="Create multi-step sequences with delays between steps, then control exactly when and how much you send."
          benefits={["Multi-step sequences and follow-ups", "Sending windows and sending days", "Daily sending limits", "Pause and resume any campaign"]}
          cta={{ to: "/product/campaigns", text: "Explore Campaigns" }}
          visual={<FrameImage src={sequencesAsset.url} alt="MunchReach sequence builder with multiple steps" />}
        />
        <FeatureStory
          id="ai"
          label="AI personalization"
          title="Make Every Email Feel Personal"
          body="Use lead variables like first name, company, and industry, and let the AI campaign writer draft openings you review before anything is sent. Connect your own OpenAI or Claude key."
          benefits={["Lead variables in every step", "AI-drafted personalized copy", "OpenAI and Claude support", "You review before sending"]}
          cta={{ to: "/products/ai-campaign-writer", text: "Explore AI Personalization" }}
          visual={<AiPersonalizationScreen />}
        />
        <FeatureStory
          id="follow-ups"
          reverse
          label="Follow-ups"
          title="Follow Up Automatically"
          body="Follow-up steps send on the delays you set and move each prospect forward automatically. When someone replies, their sequence stops."
          benefits={["Multi-step follow-ups", "Custom delays between steps", "Stops when a prospect replies", "Automatic progression"]}
          cta={{ to: "/product/follow-ups", text: "Explore Follow-ups" }}
          visual={<SequenceMock />}
        />
        <InboxSection />
        <FeatureStory
          id="warmup"
          reverse
          label="Warmup"
          title="Protect Your Sending Reputation"
          body="Warmup builds sending activity gradually on your connected mailboxes and keeps an eye on mailbox health, so problems show up before they hurt your campaigns."
          benefits={["Mailbox warmup", "Health monitoring and warmup status", "Sending activity tracking", "Deliverability warnings"]}
          cta={{ to: "/product/warmup", text: "Explore Warmup" }}
          visual={<WarmupDashboardMock />}
        />
        <FeatureStory
          id="crm"
          label="CRM"
          title="Turn Replies Into Opportunities"
          body="Contacts move through pipeline stages that stay in sync with your inbox, so every opportunity is linked to the conversation that created it."
          benefits={["Contacts and pipeline stages", "Tasks and conversation history", "Stages synced with the inbox", "Opportunity tracking to Won or Lost"]}
          cta={{ to: "/product/crm", text: "Explore CRM" }}
          visual={<CrmTableMock compact />}
        />
        <FeatureStory
          id="analytics"
          reverse
          label="Analytics"
          title="Know What's Actually Working"
          body="See sends, deliveries, opens, replies, positive replies, bounces, and meetings across campaigns and sequences, based on your real sending data."
          benefits={["Sent, delivered, opens, and replies", "Positive replies and bounces", "Campaign and sequence performance", "Meeting tracking"]}
          cta={{ to: "/product/analytics", text: "Explore Analytics" }}
          visual={<FrameImage src={analyticsAsset.url} alt="MunchReach analytics dashboard" />}
        />

        <WorkspaceSection />

        <StackSection />

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <Reveal>
            <SectionHead eyebrow="Getting started" title="Four Steps To Your First Replies" />
          </Reveal>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="h-full rounded-2xl border border-border/70 bg-card p-6">
                  <span className="text-3xl font-extrabold tracking-tight text-primary/40">{s.n}</span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHead eyebrow="Use cases" title="Built For Teams That Rely On Outbound" />
            </Reveal>
            <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {audiences.map((a) => {
                const inner = (
                  <>
                    <span className="font-semibold">{a.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </>
                );
                const cls =
                  "group flex items-center justify-between rounded-2xl border border-border/70 bg-card px-5 py-5 transition-colors hover:border-primary/40";
                return a.slug ? (
                  <Link key={a.label} to="/solutions/$slug" params={{ slug: a.slug }} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <Link key={a.label} to="/solutions" className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Product showcase */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <Reveal>
            <SectionHead eyebrow="Inside MunchReach" title="See The Product" description="The screens your team works in every day." />
          </Reveal>
          <div className="mt-10">
            <ShowcaseTabs />
          </div>
        </section>

        {/* Testimonials (real only, from content) */}
        <div className="border-y border-border/60 bg-secondary/30">
          <TestimonialCarousel page="home" title="What Customers Say" />
        </div>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
          <PageFaqs
            page="home"
            defaults={faqs}
            title="Frequently Asked Questions"
            description="Everything you need to know about MunchReach."
          />
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-20 text-center text-background sm:py-24">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_35%,transparent),transparent_70%)]"
            />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                Ready To Turn Cold Email Into Conversations?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-background/70">
                Bring your prospects, build your campaigns, and manage every conversation from one workspace.
              </p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Button size="lg" className="rounded-xl px-7" asChild>
                  <Link to="/signup">
                    Start Sending Free
                    <Send className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" className="rounded-xl px-7" asChild>
                  <Link to="/pricing">View Pricing</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
