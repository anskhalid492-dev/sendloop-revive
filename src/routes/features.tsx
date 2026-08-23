import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Bot,
  Building2,
  CheckCircle2,
  Flame,
  Inbox,
  KanbanSquare,
  ListChecks,
  Mail,
  Repeat,
  Send,
  Server,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  CtaBlock,
  MarketingLayout,
  Section,
  UseCaseGrid,
  faqJsonLd,
  metaFor,
} from "@/components/site/MarketingPage";
import { FeatureNav } from "@/components/site/FeatureNav";
import { PageFaqs } from "@/components/site/PageFaqs";
import { Reveal } from "@/components/site/Reveal";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import {
  AiMock,
  AnalyticsMock,
  ApiMock,
  AutomationMock,
  CampaignMock,
  CrmMock,
  EmailAccountsMock,
  FlowDiagram,
  InboxMock,
  LeadsMock,
  SequenceMock,
  TemplatesMock,
  WarmupMock,
  WorkspaceMock,
} from "@/components/site/FeatureMocks";
import { Button } from "@/components/ui/button";
import { applySeoOverrides } from "@/lib/page-seo";
import { BRAND_NAME } from "@/lib/branding";
import dashboardPreview from "@/assets/dashboard-preview.jpg";

const CANONICAL = "https://munchreach.com/features";
const SEO_TITLE = "Features — Cold Email & Outreach Automation";
const SEO_DESCRIPTION =
  "Campaigns, follow-ups, unified inbox, warmup, AI personalization, CRM, automations and analytics — every MunchReach feature explained.";

const faqs = [
  {
    q: `What is ${BRAND_NAME}?`,
    a: `${BRAND_NAME} is a cold outreach platform. You import leads, build multi-step email campaigns, personalize the copy, automate follow-ups, and manage every reply in a unified inbox — with warmup, CRM, automations and analytics in the same workspace.`,
  },
  {
    q: `Who is ${BRAND_NAME} for?`,
    a: "Agencies, sales teams, founders, consultants, recruiters and B2B service businesses that sell through outbound email and need campaigns, replies and prospect records in one place.",
  },
  {
    q: "Can I automate follow-ups?",
    a: "Yes. A campaign is a sequence of steps with wait windows between them. The sequence continues automatically when a prospect does not respond, and stops for that lead when a reply lands.",
  },
  {
    q: "How does the Unified Inbox work?",
    a: "Inbound replies to your campaigns are captured, matched back to the lead and campaign, and shown as a conversation. Your team can read the full history, assign conversations and reply from the same mailbox, with realtime updates.",
  },
  {
    q: "Can I connect multiple email accounts?",
    a: "Yes. You can connect several sending accounts to a workspace, see their status and health, and assign them to campaigns.",
  },
  {
    q: `Does ${BRAND_NAME} include warmup?`,
    a: "Yes. Warmup runs separately from campaign sending, ramps activity gradually, and tracks mailbox health with a per-message warmup timeline. Warmup activity is never mixed into campaign metrics.",
  },
  {
    q: "How does lead management work?",
    a: "Import leads by CSV, organize them into lists, apply bulk actions, track status and activity, and assign them to campaigns. Everything is scoped to the workspace the leads belong to.",
  },
  {
    q: `Does ${BRAND_NAME} have a CRM?`,
    a: "Yes. A built-in CRM holds contacts, a pipeline of stages, tasks and activity history, connected to the same leads and conversations your campaigns produce.",
  },
  {
    q: `Does ${BRAND_NAME} have an API?`,
    a: "Yes. Public endpoints cover integration events, automation webhooks, inbound email and media, with authentication, request/response examples and error handling documented in the API documentation.",
  },
  {
    q: `Can I use ${BRAND_NAME} with a team?`,
    a: "Yes. Invite teammates to a workspace as Owner, Admin or Member. Workspaces keep campaigns, leads, mailboxes and conversations separated per client or team.",
  },
  {
    q: "How does billing work?",
    a: "Plans are subscription-based with monthly email and lead limits, plus a one-time lifetime option. You can start free and upgrade from Settings → Billing at any time.",
  },
];

const navItems = [
  { id: "campaigns", label: "Campaigns" },
  { id: "leads", label: "Leads" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "unified-inbox", label: "Unified Inbox" },
  { id: "email-accounts", label: "Email Accounts" },
  { id: "warmup", label: "Warmup" },
  { id: "automations", label: "Automations" },
  { id: "ai", label: "AI" },
  { id: "analytics", label: "Analytics" },
  { id: "crm", label: "CRM" },
  { id: "templates", label: "Templates" },
  { id: "integrations", label: "Integrations" },
  { id: "workspaces", label: "Workspaces" },
  { id: "api", label: "API" },
];

const softwareJsonLd = {
  type: "application/ld+json",
  children: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: CANONICAL,
    description: SEO_DESCRIPTION,
    featureList: navItems.map((i) => i.label),
  }),
};

export const Route = createFileRoute("/features")({
  head: () => {
    const base = metaFor(SEO_TITLE, SEO_DESCRIPTION);
    return applySeoOverrides("/features", {
      meta: [...base.meta, { property: "og:url", content: CANONICAL }],
      links: [{ rel: "canonical", href: CANONICAL }],
      scripts: [faqJsonLd(faqs), softwareJsonLd],
    });
  },
  component: FeaturesPage,
});

/* ------------------------------------------------------------------ */
/* Page-local building blocks                                          */
/* ------------------------------------------------------------------ */

function FeatureBlock({
  id,
  index,
  icon: Icon,
  eyebrow,
  title,
  description,
  points,
  highlight,
  cta,
  ctaTo,
  muted,
  flip,
  children,
}: {
  id: string;
  index: number;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  highlight?: string;
  cta?: string;
  ctaTo?: string;
  muted?: boolean;
  flip?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={
        muted
          ? "scroll-mt-36 border-b border-border/60 bg-secondary/40 py-14 sm:py-20"
          : "scroll-mt-36 border-b border-border/60 py-14 sm:py-20"
      }
    >
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14">
        <Reveal className={flip ? "lg:order-2" : ""}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {String(index).padStart(2, "0")} · {eyebrow}
            </span>
          </div>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 text-muted-foreground">{description}</p>
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-foreground/90">{p}</span>
              </li>
            ))}
          </ul>
          {highlight ? (
            <p className="mt-6 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              {highlight}
            </p>
          ) : null}
          {cta && ctaTo ? (
            <Button className="mt-8" asChild>
              <Link to={ctaTo}>
                {cta} <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          ) : null}
        </Reveal>
        {children ? (
          <Reveal delay={80} className={flip ? "lg:order-1" : ""}>
            <div className="min-w-0">{children}</div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function FeaturesPage() {
  return (
    <MarketingLayout>
      {/* 1. HERO */}
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
            Features
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            Everything You Need to Turn Cold Emails Into{" "}
            <span className="text-gradient">Conversations</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Find the right prospects, build targeted campaigns, automate follow-ups, manage replies,
            and track your outreach from one powerful workspace.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">Start for free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/how-it-works">Explore {BRAND_NAME}</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Campaigns • Leads • Follow-ups • Unified Inbox • Warmup • Automations • Analytics
          </p>

          <Reveal delay={100}>
            <div className="mt-12 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_40px_100px_-60px_hsl(var(--primary)/0.6)]">
              <img
                src={dashboardPreview}
                alt={`${BRAND_NAME} workspace showing campaigns, sending volume and reply performance`}
                className="w-full"
                width={1600}
                height={1000}
                loading="eager"
                decoding="async"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* 2. PRODUCT OVERVIEW */}
      <Section
        title="One workspace for your entire outbound workflow."
        description={`You don't need a sending tool, a spreadsheet, a separate inbox and a CRM. ${BRAND_NAME} runs the full loop in one place, so every step hands off to the next automatically.`}
        muted
      >
        <FlowDiagram
          steps={[
            { label: "Find prospects", text: "Decide who you want to reach and collect them into a list." },
            { label: "Import leads", text: "Upload a CSV, map your fields and organize leads into lists." },
            { label: "Build campaign", text: "Create a multi-step sequence with wait windows and schedules." },
            { label: "Personalize", text: "Use lead variables and AI-assisted opening lines in your copy." },
            { label: "Automate follow-ups", text: "The sequence keeps going until the prospect replies." },
            { label: "Receive replies", text: "Inbound replies are captured and matched to the lead." },
            { label: "Manage conversations", text: "Read, assign and answer everything in the unified inbox." },
            { label: "Track results", text: "Delivery, opens, clicks, replies and bounces per campaign." },
          ]}
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <CampaignMock />
          <InboxMock />
        </div>
      </Section>

      {/* 3. FEATURE NAVIGATION */}
      <FeatureNav items={navItems} />

      {/* 4. CAMPAIGNS */}
      <FeatureBlock
        id="campaigns"
        index={1}
        icon={Send}
        eyebrow="Campaigns"
        title="Build campaigns that keep moving."
        description="Create targeted outbound campaigns, define your sequence, personalize messages, and automate follow-ups without manually managing every step."
        points={[
          "Multi-step sequences",
          "Personalized email content",
          "Automated follow-ups",
          "Scheduling",
          "Campaign controls",
          "Campaign analytics",
          "Lead-level campaign activity",
        ]}
        cta="Build a campaign"
        ctaTo="/signup"
      >
        <CampaignMock />
      </FeatureBlock>

      {/* 5. LEADS */}
      <FeatureBlock
        id="leads"
        index={2}
        icon={ListChecks}
        eyebrow="Lead management"
        title="Keep every prospect organized."
        description="Leads live in the same workspace as your campaigns. Import them, group them into lists, act on them in bulk, and follow each prospect's history from first send to reply."
        points={[
          "Import leads",
          "Lead lists",
          "Bulk actions",
          "Lead status",
          "Lead activity",
          "Campaign assignment",
          "Workspace-based organization",
          "Prospect history",
        ]}
        muted
        flip
      >
        <div className="space-y-4">
          <LeadsMock />
          <CrmMock />
        </div>
      </FeatureBlock>

      {/* 6. FOLLOW-UPS */}
      <FeatureBlock
        id="follow-ups"
        index={3}
        icon={Repeat}
        eyebrow="Automated follow-ups"
        title="Follow up without thinking about it."
        description="Most replies come from the follow-up, not the first email. When a prospect doesn't respond, the sequence continues on its own schedule — and stops the moment they answer."
        points={[
          "Multiple follow-up steps",
          "Delayed follow-ups",
          "Scheduling controls",
          "Automatic sequence progression",
          "Stop/exit conditions",
          "Reply-aware workflow",
        ]}
        highlight="Your follow-ups keep working even when you're not."
      >
        <SequenceMock />
      </FeatureBlock>

      {/* 7. UNIFIED INBOX */}
      <FeatureBlock
        id="unified-inbox"
        index={4}
        icon={Inbox}
        eyebrow="Unified Inbox"
        title="Every reply in one conversation."
        description={`Stop jumping between inboxes and campaigns. ${BRAND_NAME} brings prospect replies into a central conversation view so teams can claim, reply, organize and manage conversations.`}
        points={[
          "Unified conversations",
          "Reply tracking",
          "Lead matching",
          "Conversation history",
          "Team assignment",
          "Interested lead tracking",
          "Realtime updates",
        ]}
        cta="Explore Unified Inbox"
        ctaTo="/product/unified-inbox"
        muted
        flip
      >
        <InboxMock />
      </FeatureBlock>

      {/* 8. EMAIL ACCOUNTS */}
      <FeatureBlock
        id="email-accounts"
        index={5}
        icon={Mail}
        eyebrow="Email accounts"
        title="Connect your sending accounts in minutes."
        description="Connect and manage the mailboxes you use for outbound campaigns, keep an eye on their status, and choose which accounts each campaign sends from."
        points={[
          "Multiple sending accounts",
          "Account health",
          "Sending status",
          "Provider configuration",
          "Campaign assignment",
          "Sending controls",
        ]}
      >
        <EmailAccountsMock />
      </FeatureBlock>

      {/* 9. WARMUP */}
      <FeatureBlock
        id="warmup"
        index={6}
        icon={Flame}
        eyebrow="Warmup"
        title="Protect your sending reputation."
        description="Warmup builds up gentle, natural activity on a mailbox before and alongside your campaigns, so a new sending account isn't pushed to full volume on day one."
        points={[
          "Automated warmup",
          "Mailbox health",
          "Sending activity",
          "Warmup tracking",
          "Separate campaign and warmup metrics",
          "Account-level monitoring",
        ]}
        highlight="Warmup runs on its own track — it never counts toward your campaign numbers."
        muted
        flip
      >
        <WarmupMock />
      </FeatureBlock>

      {/* 10. AI */}
      <FeatureBlock
        id="ai"
        index={7}
        icon={Sparkles}
        eyebrow="AI"
        title="Use AI where it actually saves time."
        description={`Drop {{ai_personalization}} into a campaign step and ${BRAND_NAME} writes the opening line for each lead from the fields you imported — company, role, industry and lead notes. You connect your own API key and stay in control of the output.`}
        points={[
          "AI-assisted personalization",
          "AI suggestions from your own lead data",
          "Automated personalization workflows",
          "Personalization controls and preview",
        ]}
      >
        <AiMock />
      </FeatureBlock>

      {/* 11. AUTOMATIONS */}
      <FeatureBlock
        id="automations"
        index={8}
        icon={Workflow}
        eyebrow="Automations"
        title="Turn repetitive work into workflows."
        description="Build workflows from real product events: a lead replies, a positive reply is detected, an email bounces, a CRM stage changes. Add conditions, then let the workflow do the follow-through."
        points={[
          "Triggers: lead added, lead replied, positive reply, bounce, unsubscribe",
          "Conditions on lead, campaign, CRM and activity fields",
          "Actions: stop follow-ups, add or remove from campaign",
          "Actions: move CRM stage, tag, create task, assign owner",
          "Wait steps in minutes, hours, days or business hours",
          "Internal, Slack and outbound webhook notifications",
        ]}
        muted
        flip
      >
        <AutomationMock />
      </FeatureBlock>

      {/* 12. ANALYTICS */}
      <FeatureBlock
        id="analytics"
        index={9}
        icon={BarChart3}
        eyebrow="Analytics"
        title="Know what your outreach is actually doing."
        description="See campaign activity and understand which campaigns, sequences and leads are generating engagement. Every number comes from tracked events on your own sending — nothing is simulated."
        points={[
          "Sends and deliveries",
          "Opens and clicks",
          "Replies and interested leads",
          "Bounces and unsubscribes",
          "Per-campaign breakdown",
          "Lead-level activity",
        ]}
      >
        <AnalyticsMock />
      </FeatureBlock>

      {/* 13. CRM */}
      <FeatureBlock
        id="crm"
        index={10}
        icon={KanbanSquare}
        eyebrow="CRM"
        title="Keep prospect relationships organized."
        description="Outreach creates relationships, and the built-in CRM keeps them. Contacts, pipeline stages, tasks and history sit next to the campaigns and conversations that produced them."
        points={[
          "Contacts",
          "Pipeline",
          "Tasks",
          "Lead status",
          "Conversation history",
          "Prospect organization",
        ]}
        muted
        flip
      >
        <CrmMock />
      </FeatureBlock>

      {/* 14. TEMPLATES */}
      <FeatureBlock
        id="templates"
        index={11}
        icon={ListChecks}
        eyebrow="Templates"
        title="Start faster with reusable templates."
        description="Save the emails that work and reuse them across campaigns. Templates support the same lead variables as campaign steps, so a reusable email still reads like it was written for one person."
        points={[
          "Save reusable email templates",
          "Lead variables inside templates",
          "Reuse across campaigns and steps",
          "Edit before sending",
        ]}
      >
        <TemplatesMock />
      </FeatureBlock>

      {/* 15. INTEGRATIONS */}
      <Section
        id="integrations"
        title={`Connect ${BRAND_NAME} to the tools you already use.`}
        description="These are the integrations available in the product today. Each one is configured from Settings → Integrations in your workspace."
        muted
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "OpenAI", note: "AI", text: "Bring your own API key for AI personalization." },
            { name: "Slack", note: "Notifications", text: "Send workflow notifications to a channel." },
            { name: "Zapier", note: "Automation", text: "Trigger and receive events from your Zaps." },
            { name: "Make", note: "Automation", text: "Connect scenarios to outbound events." },
            { name: "HubSpot", note: "CRM", text: "Keep prospect records in sync with your CRM." },
            { name: "GoHighLevel", note: "CRM", text: "Push outreach activity to your GHL account." },
            { name: "Calendly", note: "Calendar", text: "Booking and cancellation events drive workflows." },
            { name: "Google Sheets", note: "Data", text: "Move lead and activity data in and out." },
          ].map((i) => (
            <Link
              key={i.name}
              to="/integrations"
              className="surface-card block p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{i.name}</h3>
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  {i.note}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{i.text}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* 16. WORKSPACES */}
      <FeatureBlock
        id="workspaces"
        index={12}
        icon={Building2}
        eyebrow="Workspaces"
        title="Separate clients, teams and campaigns cleanly."
        description="Workspaces keep campaigns, leads, mailboxes and team access organized. Invite teammates with the role they need and switch between clients without mixing data."
        points={[
          "Owner, Admin and Member roles",
          "Team invitations",
          "Per-workspace campaigns and leads",
          "Per-workspace mailboxes",
          "Scoped conversations and CRM",
          "Switch workspaces instantly",
        ]}
        flip
      >
        <WorkspaceMock />
      </FeatureBlock>

      {/* 17. API */}
      <FeatureBlock
        id="api"
        index={13}
        icon={Terminal}
        eyebrow="API"
        title={`Build ${BRAND_NAME} into your workflow.`}
        description="The developer portal documents authentication, the available public endpoints, request and response shapes, webhook events, error codes and rate limits — with copyable examples."
        points={[
          "API documentation portal",
          "Authentication and signing",
          "Integration event endpoints",
          "Automation webhook endpoints",
          "Inbound email endpoint",
          "Request, response and error examples",
        ]}
        cta="Explore API Documentation"
        ctaTo="/api-docs"
        muted
      >
        <ApiMock />
      </FeatureBlock>

      {/* 18. FEATURE COMPARISON */}
      <Section
        title="Everything you need for outbound — in one place."
        description="Each area below is part of the same product and shares the same leads, campaigns and history."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { icon: ListChecks, t: "Lead Management", d: "Import, lists, bulk actions, status." },
            { icon: Send, t: "Campaigns", d: "Multi-step sequences and schedules." },
            { icon: Sparkles, t: "Personalization", d: "Lead variables and AI opening lines." },
            { icon: Repeat, t: "Follow-ups", d: "Automatic progression, reply-aware." },
            { icon: Inbox, t: "Inbox", d: "Central replies with assignment." },
            { icon: Flame, t: "Warmup", d: "Separate ramp and health tracking." },
            { icon: Workflow, t: "Automations", d: "Triggers, conditions and actions." },
            { icon: BarChart3, t: "Analytics", d: "Real delivery and engagement events." },
            { icon: KanbanSquare, t: "CRM", d: "Contacts, pipeline, tasks, history." },
            { icon: Server, t: "API", d: "Public endpoints and webhooks." },
          ].map((c) => (
            <div key={c.t} className="surface-card p-5">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <c.icon className="size-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{c.t}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 19. HOW EVERYTHING CONNECTS */}
      <Section
        title="From first prospect to closed conversation."
        description="One record moves through the whole system — no re-entering data, no exports between tools."
        muted
      >
        <FlowDiagram
          steps={[
            { label: "Lead", text: "Imported into a list inside your workspace." },
            { label: "Campaign", text: "Enrolled as a recipient in a multi-step sequence." },
            { label: "Personalization", text: "Variables and AI lines rendered per lead." },
            { label: "Email", text: "Sent from your connected mailbox on schedule." },
            { label: "Follow-up", text: "Next step runs automatically without a reply." },
            { label: "Reply", text: "Inbound response captured and matched." },
            { label: "Unified Inbox", text: "Conversation assigned, answered and tracked." },
            { label: "CRM", text: "Contact moves along the pipeline with tasks." },
            { label: "Analytics", text: "Every event rolls up into campaign reporting." },
          ]}
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <LeadsMock />
          <SequenceMock />
          <AnalyticsMock />
        </div>
      </Section>

      {/* 20. USE CASES */}
      <Section
        title="Built for teams that sell through outbound."
        description={`However you go to market, the workflow is the same: build a list, run a sequence, handle the replies.`}
      >
        <UseCaseGrid
          items={[
            {
              icon: Building2,
              audience: "Agencies",
              scenario: "Run separate workspaces per client with their own mailboxes, leads and campaigns.",
              outcome: "Client work stays cleanly separated",
            },
            {
              icon: Users,
              audience: "Sales teams",
              scenario: "Share a unified inbox, assign conversations and track pipeline stages together.",
              outcome: "No reply falls through the cracks",
            },
            {
              icon: Send,
              audience: "Founders",
              scenario: "Run your own outbound without hiring a team or stitching four tools together.",
              outcome: "Outbound you can run yourself",
            },
            {
              icon: Bot,
              audience: "Consultants",
              scenario: "Send small, highly personalized sequences using AI opening lines and lead notes.",
              outcome: "Personal at a workable volume",
            },
            {
              icon: ListChecks,
              audience: "Recruiters",
              scenario: "Reach candidates with sequences and keep every conversation on the contact record.",
              outcome: "Full candidate history in one place",
            },
            {
              icon: Blocks,
              audience: "B2B service businesses",
              scenario: "Automate follow-ups and let workflows create tasks when someone shows interest.",
              outcome: "Interest turns into next steps",
            },
          ]}
        />
      </Section>

      {/* 21. TESTIMONIALS */}
      <TestimonialCarousel />

      {/* 22. FAQ */}
      <Section muted>
        <PageFaqs
          page="features"
          defaults={faqs}
          title={`${BRAND_NAME} features — frequently asked questions`}
          description="What the product does today, in plain language."
        />
      </Section>

      {/* 23. FINAL CTA */}
      <CtaBlock
        title="Everything you need to build better outbound campaigns."
        description="Build targeted campaigns, automate your follow-ups, manage every conversation, and keep your entire outbound workflow in one place."
        cta="Start for free"
        secondaryCta="See pricing"
        secondaryHref="/pricing"
      />
    </MarketingLayout>
  );
}
