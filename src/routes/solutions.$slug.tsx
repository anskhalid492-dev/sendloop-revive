import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import {
  BarChart3,
  CheckCircle2,
  Inbox,
  Layers,
  Mail,
  Send,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import {
  CtaBlock,
  FaqBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  Section,
  SolutionSplit,
  BeforeAfter,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  AnalyticsMock,
  CampaignMock,
  CrmMock,
  EmailAccountsMock,
  InboxMock,
  LeadsMock,
  SequenceMock,
  WarmupMock,
} from "@/components/site/FeatureMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Button } from "@/components/ui/button";
import { solutionsBySlug, type SolutionContent } from "@/lib/solutions-content";
import dashboardPreview from "@/assets/dashboard-preview.jpg";

export const Route = createFileRoute("/solutions/$slug")({
  loader: ({ params }) => {
    const content = solutionsBySlug[params.slug];
    if (!content) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const content = solutionsBySlug[params.slug];
    if (!content) {
      return {
        meta: [{ title: "Solution not found — MunchReach" }, { name: "robots", content: "noindex" }],
      };
    }
    return metaFor(
      content.seoTitle,
      content.seoDescription,
      `/solutions/${content.slug}`,
      content.faqs,
    );
  },
  notFoundComponent: SolutionNotFound,
  component: SolutionPage,
});

function SolutionNotFound() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-xl px-4 py-28 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Solution not found</h1>
        <p className="mt-3 text-muted-foreground">
          That page does not exist. Explore what MunchReach can do instead.
        </p>
        <Button className="mt-8" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </MarketingLayout>
  );
}

/* -------------------------------------------------------------- sections */

/** Dark, full-width problem section — the visual anchor of the page. */
function ProblemSection({ content }: { content: SolutionContent }) {
  return (
    <section className="relative overflow-hidden border-y border-border/60 bg-foreground text-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background:radial-gradient(60%_60%_at_20%_0%,hsl(var(--primary))_0%,transparent_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">
          {content.problemHeading}
        </h2>
        <p className="mt-6 max-w-2xl text-pretty text-base leading-7 opacity-80 sm:text-lg">
          {content.problemIntro}
        </p>
        <div className="mt-14 grid gap-x-14 gap-y-10 sm:grid-cols-2">
          {content.problemItems.map((item, i) => (
            <div key={item.title} className="border-t border-background/20 pt-6">
              <span className="text-xs font-semibold tracking-[0.2em] opacity-50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-xl font-bold tracking-tight">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 opacity-75">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Editorial capability list — deliberately not a card grid. */
function PillarsSection({ content }: { content: SolutionContent }) {
  return (
    <section className="border-b border-border/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              One platform
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              {content.solutionHeading}
            </h2>
            <p className="mt-5 text-pretty leading-7 text-muted-foreground">
              {content.solutionIntro}
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "Leads",
                "Campaigns",
                "Sequences",
                "Sending accounts",
                "Scheduling",
                "Warmup",
                "Unified inbox",
                "Replies",
                "Analytics",
                "CRM",
                "Automations",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-border/70">
            {content.pillars.map((p) => (
              <li key={p.title} className="flex gap-5 py-7 first:pt-0">
                <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <p.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-muted-foreground">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Numbered, alternating workflow with a real product view beside each step. */
const HOW_IT_WORKS: { title: string; text: string; visual: () => JSX.Element }[] = [
  {
    title: "Build your prospect list",
    text: "Start from the people worth talking to. Import a CSV, map your own columns and let duplicates and previously suppressed addresses drop out on the way in. The list becomes a reusable source rather than a one-off file.",
    visual: () => <LeadsMock />,
  },
  {
    title: "Organize your leads",
    text: "Segment the list by the fields that change your message — role, industry, region, company size. Clean segments are what make personalization possible later, and they let you compare performance between audiences afterwards.",
    visual: () => <CrmMock />,
  },
  {
    title: "Create your sequence",
    text: "Write the opening email and the follow-ups that come after it. Personalization variables pull from your imported fields, and fallbacks keep the sentence intact when a value is missing. Every step has its own delay.",
    visual: () => <SequenceMock />,
  },
  {
    title: "Connect your sending accounts",
    text: "Add the mailboxes the campaign will send from and set a daily limit for each. Warmup runs in the background, and health status tells you when an account should carry less volume for a while.",
    visual: () => <EmailAccountsMock />,
  },
  {
    title: "Schedule your campaign",
    text: "Choose the time zone, the sending window, the daily cap, the hourly maximum and the delay between messages. The scheduler spreads the day's volume across your accounts instead of firing everything at once.",
    visual: () => <CampaignMock />,
  },
  {
    title: "Manage replies",
    text: "Answers arrive in the unified inbox with the full thread and the prospect record attached. Remaining follow-ups stop automatically for anyone who replies, bounces or unsubscribes, so nobody gets chased after answering.",
    visual: () => <InboxMock />,
  },
  {
    title: "Measure performance",
    text: "Track sends, deliveries, replies, positive replies and unsubscribes per campaign, per segment and per sending account — so the next campaign is built on what happened in the last one.",
    visual: () => <AnalyticsMock />,
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-border/60 bg-secondary/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            From prospect to conversation
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Seven steps, in the order you would actually do them. Each one happens in the same
            workspace, so nothing has to be exported, re-imported or reconciled between tools.
          </p>
        </div>
        <div className="mt-16 space-y-20">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="grid min-w-0 items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 === 1 ? "min-w-0 lg:order-2" : "min-w-0"}>
                <span className="text-5xl font-black tracking-tight text-primary/20 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{step.title}</h3>
                <p className="mt-4 leading-7 text-muted-foreground">{step.text}</p>
              </div>
              <div className={i % 2 === 1 ? "min-w-0 lg:order-1" : "min-w-0"}>{step.visual()}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Large single product view with the seven areas explained around it. */
const WORKSPACE_AREAS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Layers, title: "Campaigns", text: "Every campaign with its audience, sequence, schedule and current state." },
  { icon: Settings2, title: "Leads", text: "Imported, deduplicated and segmented contact data feeding those campaigns." },
  { icon: Send, title: "Sending accounts", text: "Connected mailboxes with daily limits, health and capacity in view." },
  { icon: Inbox, title: "Inbox", text: "Replies from every campaign and mailbox in one shared thread list." },
  { icon: BarChart3, title: "Analytics", text: "Delivery, reply and positive-reply performance you can act on." },
  { icon: Mail, title: "CRM", text: "Statuses, owners and notes carrying conversations to an outcome." },
  { icon: ShieldCheck, title: "Warmup", text: "Sending reputation built and maintained in the background." },
];

function WorkspaceShowcase() {
  return (
    <section id="product" className="scroll-mt-20 border-b border-border/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            The workspace
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            One workspace for your entire outbound operation
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Campaigns, leads, sending accounts, the inbox, analytics, CRM and warmup are parts of the
            same product — not integrations you have to keep in sync.
          </p>
        </div>
        <div className="mt-12 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_40px_120px_-60px_hsl(var(--primary)/0.6)]">
          <img
            src={dashboardPreview}
            alt="MunchReach workspace showing campaigns, sending activity and reply performance"
            className="w-full"
            loading="lazy"
          />
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {WORKSPACE_AREAS.map((a) => (
            <div key={a.title} className="border-t border-border pt-5">
              <a.icon className="size-5 text-primary" />
              <h3 className="mt-3 text-base font-semibold">{a.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SHOWCASES = [
  {
    eyebrow: "Campaign builder",
    title: "Set the campaign up once, then let it run",
    text: "A campaign holds everything that decides what goes out and when: the audience, the sequence, the sending accounts and the schedule. Change one of them and the plan for the coming days is rebuilt around it.",
    bullets: [
      "Multi-step sequences with per-step delays",
      "Time zone, sending window and daily cap per campaign",
      "Hourly maximum and randomized delay between sends",
      "Follow-ups cancelled on reply, bounce or unsubscribe",
    ],
    visual: <CampaignMock />,
  },
  {
    eyebrow: "Sending accounts",
    title: "Keep sending capacity visible and under control",
    text: "Volume is limited by the mailboxes behind it. Every connected account shows its daily limit, how much of it is used and whether it is healthy enough to keep sending today.",
    bullets: [
      "Per-account daily limits and hourly caps",
      "Health status before capacity becomes a problem",
      "Volume spread across accounts automatically",
      "Warmup running in the background",
    ],
    visual: <EmailAccountsMock />,
  },
  {
    eyebrow: "Unified inbox",
    title: "Every reply in one thread list",
    text: "Replies from every campaign and every mailbox land in one place, with the exact message that was sent, the full thread, the prospect record and any notes your team added.",
    bullets: [
      "The sent email exactly as the prospect received it",
      "Assign conversations and leave internal notes",
      "Reply without switching mailboxes",
      "Status updates that flow through to the CRM",
    ],
    visual: <InboxMock />,
  },
  {
    eyebrow: "Analytics",
    title: "Numbers that tell you what to change",
    text: "Delivery, reply and positive-reply performance per campaign, segment and sending account — the three levels where outbound is usually fixed.",
    bullets: [
      "Sends, deliveries, replies and unsubscribes over time",
      "Positive replies tracked separately from raw replies",
      "Performance compared between campaigns",
      "Mailbox-level view when delivery drops",
    ],
    visual: <AnalyticsMock />,
  },
  {
    eyebrow: "Warmup",
    title: "Sending reputation maintained quietly",
    text: "New mailboxes ramp gradually and established ones keep a steady background pattern, so a campaign is not the first serious traffic an account has ever sent.",
    bullets: [
      "Gradual ramp for new accounts",
      "Ongoing activity for established mailboxes",
      "Visible per-account warmup status",
      "Nothing to configure per campaign",
    ],
    visual: <WarmupMock />,
  },
];

function WorkflowChain({ content }: { content: SolutionContent }) {
  return (
    <section className="border-b border-border/60 bg-secondary/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Your workflow
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {content.workflowHeading}
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">{content.workflowIntro}</p>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
          {content.workflow.map((step, i) => (
            <li key={step.title} className="bg-background p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-xs font-bold text-primary tabular-nums">
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function OutcomesSection({ content }: { content: SolutionContent }) {
  return (
    <section className="border-b border-border/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Outcomes
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              What changes once outbound lives in one place
            </h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              No promises about reply rates or meetings — those depend on your offer and your list.
              What MunchReach changes is the operation around them.
            </p>
          </div>
          <dl className="space-y-8">
            {content.outcomes.map((o) => (
              <div key={o.title} className="flex gap-4 border-t border-border/70 pt-6 first:border-0 first:pt-0">
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-primary" />
                <div>
                  <dt className="text-lg font-semibold tracking-tight">{o.title}</dt>
                  <dd className="mt-1.5 text-sm leading-7 text-muted-foreground">{o.text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-16">
          <BeforeAfter before={content.before} after={content.after} />
        </div>
      </div>
    </section>
  );
}

const WHY: { title: string; text: string }[] = [
  { title: "One platform", text: "Manage the moving parts of outbound from one workspace instead of stitching tools together." },
  { title: "Unified inbox", text: "Prospect conversations stay together, with the exact message that was sent attached to the thread." },
  { title: "Multiple sending accounts", text: "Sending infrastructure is managed centrally, with limits, health and warmup per account." },
  { title: "Campaign control", text: "Schedules, sequences, sending windows and daily limits are yours to set per campaign." },
  { title: "Analytics", text: "Delivery, reply and positive-reply performance at campaign, segment and mailbox level." },
  { title: "Built for outbound", text: "The product is designed around the operational workflow of outbound teams, not adapted from a generic mail tool." },
];

function WhySection() {
  return (
    <section className="border-b border-border/60 bg-secondary/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Why MunchReach?</h2>
        <div className="mt-12 grid gap-x-14 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((w) => (
            <div key={w.title} className="border-t border-border pt-5">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
                {w.title}
              </h3>
              <p className="mt-3 leading-7 text-muted-foreground">{w.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExploreLinks() {
  return (
    <section className="border-b border-border/60 py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">Keep exploring MunchReach</h2>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link to="/features" className="text-primary hover:underline">
            All features
          </Link>
          <Link to="/pricing" className="text-primary hover:underline">
            Pricing
          </Link>
          <Link to="/solutions" className="text-primary hover:underline">
            All solutions
          </Link>
          <Link to="/product/campaigns" className="text-primary hover:underline">
            Campaigns
          </Link>
          <Link to="/product/unified-inbox" className="text-primary hover:underline">
            Unified inbox
          </Link>
          <Link to="/product/analytics" className="text-primary hover:underline">
            Analytics
          </Link>
          <Link to="/blog" className="text-primary hover:underline">
            Blog
          </Link>
          <Link to="/help-center" className="text-primary hover:underline">
            Help center
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ page */

function SolutionPage() {
  const { slug } = Route.useLoaderData();
  const content = solutionsBySlug[slug];
  if (!content) return <SolutionNotFound />;

  return (
    <MarketingLayout>
      <PageHero
        eyebrow={content.eyebrow}
        title={content.title}
        highlight={content.highlight}
        description={content.description}
        benefits={content.heroBenefits}
        primaryCta="Start Free"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <ProblemSection content={content} />
      <PillarsSection content={content} />
      <HowItWorksSection />

      <Section title={content.featuresHeading} description={content.featuresIntro} muted>
        <FeatureGrid items={content.features} />
      </Section>

      <WorkspaceShowcase />

      <Section
        title="See the product behind the workflow"
        description="Real MunchReach interfaces, in the order an outbound team touches them."
      >
        <SolutionSplit rows={SHOWCASES} />
      </Section>

      <WorkflowChain content={content} />
      <OutcomesSection content={content} />
      <WhySection />

      <TestimonialCarousel page="solutions" />

      <Section title="Frequently asked questions">
        <FaqBlock faqs={content.faqs} />
      </Section>

      <ExploreLinks />

      <CtaBlock
        title={content.ctaTitle}
        description={content.ctaDescription}
        cta="Get Started"
        secondaryCta="Explore MunchReach"
        secondaryHref="#product"
      />
    </MarketingLayout>
  );
}
