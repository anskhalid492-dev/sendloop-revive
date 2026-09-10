import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  Flame,
  Inbox,
  Layers,
  LineChart,
  PlayCircle,
  Repeat,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
  Workflow,
} from "lucide-react";

import { FaqBlock, MockBars, MockPanel, MockRows } from "@/components/site/MarketingPage";
import { HeroProductVisual } from "@/components/site/HeroProductVisual";
import { Reveal } from "@/components/site/Reveal";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Button } from "@/components/ui/button";
import dashboardPreviewAsset from "@/assets/munchreach-dashboard.png.asset.json";
const dashboardPreview = dashboardPreviewAsset.url;
import inboxPreview from "@/assets/munchreach-unified-inbox-light.png";
import { PageFaqs } from "@/components/site/PageFaqs";
import { applySeoOverrides } from "@/lib/page-seo";
import { SITE_URL } from "@/lib/seo";

const faqs = [
  {
    q: "What is MunchReach?",
    a: "MunchReach is a cold email platform. You build campaigns, automate follow-ups, manage every reply in one inbox and track your outreach — all from a single workspace.",
  },
  {
    q: "How does MunchReach handle email sending?",
    a: "Sending is fully managed. Once you launch a campaign, MunchReach queues and delivers your emails in the background, respecting daily limits, delays and your sending window.",
  },
  {
    q: "Do I need my own SMTP or email API?",
    a: "No. You don't need to connect your own email provider. MunchReach manages the sending infrastructure behind the scenes, so there is nothing technical for you to configure.",
  },
  {
    q: "How do I start a campaign?",
    a: "Create your workspace, import your prospects, write your first email, add follow-up steps, choose a schedule and launch. It takes minutes, not days.",
  },
  {
    q: "Can I automate follow-ups?",
    a: "Yes. Add as many follow-up steps as you like with your own delays. MunchReach sends them automatically and stops the sequence the moment a prospect replies.",
  },
  {
    q: "Can I manage replies in one inbox?",
    a: "Every reply lands in the unified inbox where you can classify it, assign it to a teammate, add internal notes and see the full conversation and campaign history.",
  },
  {
    q: "Does MunchReach include warmup?",
    a: "Yes. MunchReach gradually builds sending activity, monitors mailbox health and flags deliverability issues before they hurt your campaigns.",
  },
  {
    q: "Can I use MunchReach with a team?",
    a: "Invite teammates to your workspace with roles such as admin, campaign manager, inbox manager or analyst, and assign conversations between them.",
  },
  {
    q: "Does MunchReach include a CRM?",
    a: "Yes. Prospects move through pipeline stages from new to contacted, replied, interested, meeting and won, connected to the conversation that created them.",
  },
  {
    q: "How does pricing work?",
    a: "Start free, then pick a monthly or yearly plan based on how many prospects, campaigns and emails you need. Full details are on the pricing page.",
  },
];

const workflowSteps = [
  {
    icon: Target,
    title: "Find Prospects",
    text: "Build targeted prospect lists and focus your outreach on the people most likely to buy.",
  },
  {
    icon: Sparkles,
    title: "Personalize",
    text: "Use AI to create relevant personalization for every prospect without writing every email manually.",
  },
  {
    icon: Send,
    title: "Launch Campaigns",
    text: "Create multi-step cold email campaigns and send them through your connected mailboxes.",
  },
  {
    icon: Repeat,
    title: "Follow Up",
    text: "Automatically send the right follow-up at the right time without manually tracking prospects.",
  },
  {
    icon: Inbox,
    title: "Manage Replies",
    text: "Bring replies into one inbox, organize conversations, and keep every prospect easy to manage.",
  },
  {
    icon: CalendarCheck,
    title: "Book Meetings",
    text: "Track positive replies and meetings so users can see which campaigns actually produce results.",
  },
];

/**
 * Premium 6-step outbound workflow directly below the hero. The connecting
 * line and the soft "active step" pulse only show on wide screens where the
 * steps sit horizontally; on mobile the steps stack with no line.
 */
function WorkflowSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % workflowSteps.length);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-36">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          Everything you need to run outbound
        </span>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          From first prospect to booked meeting — all in one place.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Find the right prospects, personalize every message, send safely from your mailboxes,
          manage replies, and track what turns into revenue.
        </p>
      </div>

      <div className="relative mt-14 lg:mt-16">
        {/* Connecting progress line — only spans the icon row on wide screens */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-[26px] hidden h-px bg-gradient-to-r from-primary/0 via-primary/35 to-primary/0 lg:block"
        />
        {/* Moving active-step dot along the line */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-[22px] hidden size-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)] transition-[left] duration-700 ease-in-out lg:block"
          style={{ left: `calc(${(active + 0.5) * (100 / workflowSteps.length)}%)` }}
        />

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {workflowSteps.map((step, i) => {
            const isActive = active === i;
            return (
              <li
                key={step.title}
                className="relative flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all duration-500 lg:p-6"
                style={{
                  borderColor: isActive
                    ? "var(--primary)"
                    : "var(--border)",
                  boxShadow: isActive
                    ? "0 18px 45px -28px oklch(0.685 0.145 231 / 0.55)"
                    : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="relative flex size-11 items-center justify-center rounded-xl border border-border/70 bg-primary/10 text-primary transition-colors duration-500"
                    style={
                      isActive ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined
                    }
                  >
                    <step.icon className="size-5" />
                  </span>
                  <span className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">
                    {`0${i + 1}`}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold sm:text-base">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                  {step.text}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const coreValues = [
  { icon: Layers, title: "Campaigns", text: "Build multi-step cold email sequences." },
  { icon: Repeat, title: "Follow-Ups", text: "Automatically follow up until prospects respond." },
  { icon: Inbox, title: "Unified Inbox", text: "Manage every reply from one place." },
  { icon: Flame, title: "Warmup", text: "Protect and improve sending reputation." },
  { icon: Users, title: "CRM", text: "Turn conversations into opportunities." },
  { icon: BarChart3, title: "Analytics", text: "Know exactly what's working." },
];

const audiences = [
  { icon: Target, title: "Lead Generation Agencies", text: "Run every client list from a separate workspace." },
  { icon: Briefcase, title: "Sales Teams", text: "A repeatable outbound motion the whole team follows." },
  { icon: Rocket, title: "SaaS Companies", text: "Test positioning and turn replies into demos." },
  { icon: Users, title: "Recruiting Agencies", text: "Reach candidates and clients before competitors." },
  { icon: Sparkles, title: "Marketing Agencies", text: "Add outbound to the services you already sell." },
  { icon: Building2, title: "Consultants", text: "Keep the calendar full between projects." },
  { icon: CalendarCheck, title: "Appointment Setters", text: "Book meetings from replies in one inbox." },
  { icon: ShieldCheck, title: "B2B Service Companies", text: "Consistent outreach without technical setup." },
];

const howItWorks = [
  { n: "01", title: "Create your workspace", text: "Name it, invite your team and you're set up." },
  { n: "02", title: "Add your prospects", text: "Import a CSV, map fields and drop duplicates." },
  { n: "03", title: "Build your campaign", text: "Write the first email, then add follow-up steps." },
  { n: "04", title: "Launch and manage replies", text: "MunchReach sends; replies land in your inbox." },
];

const followUpFlow = [
  { label: "Initial email", meta: "Day 0" },
  { label: "Wait 2 days", meta: "No reply" },
  { label: "Follow-up", meta: "Day 2" },
  { label: "Wait 3 days", meta: "No reply" },
  { label: "Final follow-up", meta: "Day 5" },
  { label: "Reply received", meta: "Sequence stops" },
];

const HOME_TITLE = "MunchReach: The All-in-One Cold Outreach Platform";
const HOME_DESCRIPTION =
  "Build targeted cold email campaigns, automate follow-ups, manage leads and replies, and grow your pipeline with MunchReach, all in one platform.";

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
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "MunchReach",
            url: SITE_URL,
          }),
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

function SectionHead({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function ExploreLink({ to, children }: { to: string; children: string }) {
  return (
    <Button variant="outline" className="mt-7 group" asChild>
      <Link to={to}>
        {children}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Button>
  );
}

function Home() {
  return (
    <div id="top" className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* ---------------------------------------------------------- Hero */}
        <section className="hero-glow relative overflow-hidden">
          {/* Subtle blue/sky ambience + soft glow behind the headline */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-24 size-[34rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] [background-size:44px_44px]"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20 lg:grid-cols-[43fr_57fr] lg:gap-10">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-primary sm:text-xs">
                <Sparkles className="size-4 shrink-0" />
                The outbound platform built for real conversations
              </span>
              <h2 className="mt-6 text-[2.1rem] font-extrabold leading-[1.08] tracking-tight text-balance sm:text-[3rem] sm:leading-[1.05] lg:text-[3.4rem]">
                Your Next Customer{" "}
                <span className="text-gradient">Could Be One Email Away.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground lg:mx-0 sm:mt-6 sm:text-lg">
                Find the right prospects, personalize every message, automate follow-ups, and manage
                replies — all from one simple outbound platform.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-start">
                <Button
                  size="lg"
                  className="w-full rounded-xl px-8 shadow-lg shadow-primary/20 sm:w-auto"
                  asChild
                >
                  <Link to="/signup">
                    Start Sending Free
                    <Send className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full rounded-xl bg-card px-8 sm:w-auto"
                  asChild
                >
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

            <div className="relative pb-8 lg:pb-0">
              <HeroProductVisual />
            </div>
          </div>
        </section>


        {/* ------------------------------- Workflow: prospect → meeting */}
        <WorkflowSection />

{/* ------------------------------------------- Everything you need */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <Reveal>
            <SectionHead
              eyebrow="The platform"
              title="Everything You Need to Run Cold Email"
              description="From finding the right prospects to managing replies, MunchReach gives your team one place to run outbound."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-6">
            {coreValues.map((f, i) => (
              <Reveal
                key={f.title}
                delay={i * 60}
                className={i === 0 || i === 3 ? "md:col-span-4" : "md:col-span-2"}
              >
                <div className="surface-card h-full p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------- One workspace */}
        <section className="border-y border-border/60 bg-secondary/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <SectionHead
                eyebrow="One place"
                title="One Workspace For Your Entire Outreach"
                description="Campaigns, leads, inbox, warmup, CRM and analytics all feed each other — nothing lives in a separate tool."
              />
            </Reveal>

            <div className="mt-12 grid items-center gap-6 lg:grid-cols-[1fr_2fr_1fr]">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { icon: Layers, label: "Campaigns" },
                  { icon: Users, label: "Leads" },
                  { icon: Inbox, label: "Inbox" },
                ].map((x, i) => (
                  <Reveal key={x.label} delay={i * 80}>
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
                      <x.icon className="size-4 text-primary" />
                      {x.label}
                    </div>
                  </Reveal>
                ))}
              </div>

              <Reveal delay={120}>
                <div className="browser-frame">
                  <img
                    src={dashboardPreview}
                    alt="MunchReach workspace with campaigns, prospects and performance in one view"
                    width={1600}
                    height={1008}
                    loading="lazy"
                    className="w-full"
                  />
                </div>
              </Reveal>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { icon: Flame, label: "Warmup" },
                  { icon: Target, label: "CRM" },
                  { icon: LineChart, label: "Analytics" },
                ].map((x, i) => (
                  <Reveal key={x.label} delay={i * 80}>
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
                      <x.icon className="size-4 text-primary" />
                      {x.label}
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- Campaigns */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal>
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                  Campaigns
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Build Campaigns Without The Busywork
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Create personalized cold email sequences, add follow-ups, test different messages,
                  and launch campaigns in minutes.
                </p>
                <ul className="mt-6 grid gap-2.5 text-sm text-muted-foreground">
                  {[
                    "Multi-step sequences with your own delays",
                    "Personalization variables with safe fallbacks",
                    "Message variants to test what lands",
                    "Sending windows, days and daily caps",
                    "Pause, resume and stop conditions",
                  ].map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
                <ExploreLink to="/product/campaigns">Explore Campaigns</ExploreLink>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <MockPanel title="Campaign — Q3 Agency Outreach">
                <MockRows
                  rows={[
                    { left: "Step 1 · Intro email", muted: "Sent immediately", badge: "Active" },
                    { left: "Step 2 · Follow-up", muted: "Wait 2 days", right: "No reply" },
                    { left: "Step 3 · Case study", muted: "Wait 3 days", right: "No reply" },
                    { left: "Step 4 · Final nudge", muted: "Wait 4 days", right: "No reply" },
                  ]}
                />
                <div className="mt-4">
                  <MockBars
                    bars={[
                      { label: "Delivered", value: 96, caption: "1,842" },
                      { label: "Replies", value: 34, caption: "128" },
                      { label: "Positive replies", value: 18, caption: "57" },
                    ]}
                  />
                </div>
              </MockPanel>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------- Follow-ups */}
        <section className="border-y border-border/60 bg-secondary/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <SectionHead
                eyebrow="Follow-ups"
                title="Follow Up Automatically Without Chasing Leads"
                description="MunchReach handles the follow-up process automatically while stopping outreach when prospects respond."
              />
            </Reveal>

            <Reveal delay={100}>
              <ol className="mx-auto mt-12 max-w-md space-y-0">
                {followUpFlow.map((step, i) => (
                  <li key={step.label}>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                      <span className="text-sm font-medium">{step.label}</span>
                      <span className="text-xs text-muted-foreground">{step.meta}</span>
                    </div>
                    {i < followUpFlow.length - 1 ? (
                      <div aria-hidden="true" className="mx-auto h-7 w-0.5 flow-line" />
                    ) : null}
                  </li>
                ))}
              </ol>
            </Reveal>

            <div className="mt-10 text-center">
              <ExploreLink to="/product/follow-ups">Explore Follow-Ups</ExploreLink>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- Unified inbox */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="lg:order-2">
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                  Unified inbox
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Every Reply. One Inbox.
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Stop jumping between mailboxes and campaigns. Manage conversations, classify
                  replies, assign conversations, add notes, and keep your entire team on the same
                  page.
                </p>
                <ul className="mt-6 grid gap-2.5 text-sm text-muted-foreground">
                  {[
                    "Reply classification: interested, not now, out of office",
                    "Assign conversations to the right teammate",
                    "Internal notes and mentions",
                    "Saved replies for fast responses",
                    "Full conversation and campaign history",
                    "Prospect and CRM details beside the thread",
                  ].map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
                <ExploreLink to="/product/unified-inbox">Explore Unified Inbox</ExploreLink>
              </div>
            </Reveal>
            <Reveal delay={100} className="lg:order-1">
              <div className="browser-frame">
                <img
                  src={inboxPreview}
                  alt="MunchReach unified inbox with labelled replies, conversation thread and prospect details"
                  width={1102}
                  height={717}
                  loading="lazy"
                  className="w-full"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- Warmup */}
        <section className="border-y border-border/60 bg-secondary/30 py-20">
          <div className="mx-auto max-w-6xl grid items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14">
            <Reveal>
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                  Warmup
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Protect Your Sending Reputation
                </h2>
                <p className="mt-4 text-muted-foreground">
                  MunchReach helps you gradually build sending activity, monitor mailbox health, and
                  identify deliverability problems before they hurt your campaigns.
                </p>
                <ul className="mt-6 grid gap-2.5 text-sm text-muted-foreground">
                  {[
                    "Gradual warmup ramp for every mailbox",
                    "Mailbox health scoring",
                    "Sending activity tracking",
                    "Reputation monitoring",
                    "Alerts when something looks wrong",
                  ].map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
                <ExploreLink to="/product/warmup">Explore Warmup</ExploreLink>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <MockPanel title="Mailbox health">
                <MockBars
                  bars={[
                    { label: "sales@yourdomain.com", value: 94, caption: "Healthy" },
                    { label: "outreach@yourdomain.com", value: 81, caption: "Warming" },
                    { label: "hello@yourdomain.com", value: 62, caption: "Warming" },
                  ]}
                />
                <div className="mt-4">
                  <MockRows
                    rows={[
                      { left: "Daily warmup target", right: "38 / 40" },
                      { left: "Spam placement", right: "0.4%" },
                      { left: "Bounce rate", right: "1.1%" },
                    ]}
                  />
                </div>
              </MockPanel>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- CRM */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="lg:order-2">
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                  CRM
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Turn Replies Into Opportunities
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Keep prospect information, conversations, tasks, and opportunities connected to
                  your outreach.
                </p>
                <ExploreLink to="/product/crm">Explore CRM</ExploreLink>
              </div>
            </Reveal>
            <Reveal delay={100} className="lg:order-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {["New", "Contacted", "Replied", "Interested", "Meeting", "Won"].map((stage, i) => (
                  <div
                    key={stage}
                    className="rounded-xl border border-border bg-card p-4 text-center"
                  >
                    <div className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                      {`0${i + 1}`}
                    </div>
                    <div className="mt-2 text-sm font-medium">{stage}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------- Analytics */}
        <section className="border-y border-border/60 bg-secondary/30 py-20">
          <div className="mx-auto max-w-6xl grid items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14">
            <Reveal>
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                  Analytics
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Know What&apos;s Actually Working
                </h2>
                <p className="mt-4 text-muted-foreground">
                  See which campaigns, messages, and sequences are creating real conversations.
                </p>
                <ul className="mt-6 grid gap-2.5 text-sm text-muted-foreground">
                  {[
                    "Emails sent, replies and positive replies",
                    "Meetings created from outreach",
                    "Campaign and sequence performance",
                    "Step-by-step breakdown of what converts",
                    "Sending performance over time",
                  ].map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
                <ExploreLink to="/product/analytics">Explore Analytics</ExploreLink>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <MockPanel title="Campaign performance">
                <MockBars
                  bars={[
                    { label: "Step 1 · Intro", value: 62, caption: "Reply 4.1%" },
                    { label: "Step 2 · Follow-up", value: 78, caption: "Reply 6.8%" },
                    { label: "Step 3 · Case study", value: 44, caption: "Reply 3.2%" },
                    { label: "Step 4 · Final nudge", value: 31, caption: "Reply 2.4%" },
                  ]}
                />
              </MockPanel>
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------- Managed sending */}
        <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <Reveal>
            <SectionHead
              eyebrow="Managed sending"
              title="We Handle The Complicated Part"
              description="You shouldn't need to understand email infrastructure just to run a cold email campaign. MunchReach manages the sending layer behind the scenes so you can focus on your leads, messages, and conversations."
            />
          </Reveal>
          <Reveal delay={100}>
            <ol className="mx-auto mt-12 max-w-sm">
              {[
                { label: "Your workspace", text: "Leads, campaigns, sequences" },
                { label: "MunchReach", text: "Scheduling, throttling, retries" },
                { label: "Managed sending infrastructure", text: "Fully handled for you" },
                { label: "Your prospects", text: "Replies land in your inbox" },
              ].map((node, i, arr) => (
                <li key={node.label}>
                  <div className="surface-card px-5 py-4 text-center">
                    <div className="text-sm font-semibold">{node.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{node.text}</div>
                  </div>
                  {i < arr.length - 1 ? (
                    <div aria-hidden="true" className="mx-auto h-8 w-0.5 flow-line" />
                  ) : null}
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* ------------------------------------------------------ Who it's for */}
        <section className="border-y border-border/60 bg-secondary/30 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHead
                eyebrow="Who it's for"
                title="Built For Teams That Rely On Outbound"
                description="If new conversations drive your revenue, MunchReach is the workspace your team runs them from."
              />
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {audiences.map((a, i) => (
                <Reveal key={a.title} delay={(i % 4) * 60}>
                  <div className="h-full rounded-2xl border border-border bg-card p-5">
                    <a.icon className="size-5 text-primary" />
                    <h3 className="mt-3 text-sm font-semibold">{a.title}</h3>
                    <p className="mt-1.5 text-xs text-muted-foreground">{a.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
          <Reveal>
            <SectionHead
              eyebrow="Getting started"
              title="Start Sending In Minutes"
              description="Four steps from signing up to managing your first replies."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="surface-card h-full p-6">
                  <span className="text-2xl font-extrabold tracking-tight text-primary/40">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">
                Start for Free
                <Upload className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">View Pricing</Link>
            </Button>
          </div>
        </section>

        {/* ---------------------------------------------------- Testimonials */}
        <div className="border-y border-border/60 bg-secondary/30">
          <TestimonialCarousel page="home" title="Loved By Outreach Teams" />
        </div>

        {/* ------------------------------------------------------------- FAQ */}
        <section id="faq" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <PageFaqs
            page="home" defaults={faqs}
            title="Frequently Asked Questions"
            description="Everything you need to know about MunchReach."
          />
        </section>

        {/* ------------------------------------------------------- Final CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="hero-glow surface-card px-6 py-16 text-center">
            <Workflow className="mx-auto size-6 text-primary" />
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              Ready To Turn Cold Email Into Conversations?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Create your workspace, launch your first campaign, and let MunchReach handle the rest.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">Start for Free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">View Pricing</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
