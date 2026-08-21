import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Flame,
  Globe,
  Inbox,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  MockBars,
  MockPanel,
  MockRows,
  Section,
  UseCaseGrid,
  faqJsonLd,
  metaFor,
} from "@/components/site/MarketingPage";
import { FeatureNav } from "@/components/site/FeatureNav";
import { Reveal } from "@/components/site/Reveal";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Button } from "@/components/ui/button";
import { applySeoOverrides } from "@/lib/page-seo";
import { BRAND_NAME } from "@/lib/branding";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import inboxPreview from "@/assets/inbox-preview.jpg";

const CANONICAL = "https://munchreach.com/features";
const SEO_TITLE = "Features — The Complete MunchReach Outbound Platform";
const SEO_DESCRIPTION =
  "Campaigns, AI personalization, unified inbox, warmup, CRM, automations, analytics, email accounts, domains and integrations — every MunchReach feature explained.";

const faqs = [
  {
    q: "Do I need separate tools for sending, inbox and CRM?",
    a: "No. Campaigns, the unified inbox, CRM, automations and analytics all live in the same MunchReach workspace and share the same contacts and history.",
  },
  {
    q: "How does AI personalization work?",
    a: "The campaign builder can draft opening lines and copy from the lead and company fields you imported. Every message stays editable and previewable before anything is sent.",
  },
  {
    q: "Can I use my own domain and email accounts?",
    a: "Yes. You add your own sending domain, verify SPF, DKIM and DMARC through the guided domain setup, then connect email accounts on top of it.",
  },
  {
    q: "What does warmup actually do?",
    a: "It ramps sending volume gradually inside safe daily and hourly limits and tracks mailbox health, so new accounts are not pushed to full volume on day one.",
  },
  {
    q: "Are analytics based on real data?",
    a: "Yes. Every number comes from tracked delivery, open, click, reply, bounce and unsubscribe events on your own campaigns — there is no demo data in reporting.",
  },
];

const navItems = [
  { id: "campaigns", label: "Campaigns" },
  { id: "ai-personalization", label: "AI Personalization" },
  { id: "unified-inbox", label: "Unified Inbox" },
  { id: "warmup", label: "Warmup" },
  { id: "crm", label: "CRM" },
  { id: "automations", label: "Automations" },
  { id: "analytics", label: "Analytics" },
  { id: "email-accounts", label: "Email Accounts" },
  { id: "domains", label: "Domain Management" },
  { id: "integrations", label: "Integrations" },
  { id: "leads", label: "Lead Management" },
  { id: "workspaces", label: "Workspaces" },
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
          ? "scroll-mt-36 border-b border-border/60 bg-secondary/40 py-16 sm:py-20"
          : "scroll-mt-36 border-b border-border/60 py-16 sm:py-20"
      }
    >
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
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

function FlowStack({ steps }: { steps: { label: string; text: string }[] }) {
  return (
    <ol className="mx-auto grid max-w-3xl gap-3">
      {steps.map((s, i) => (
        <li key={s.label}>
          <Reveal delay={i * 40}>
            <div className="surface-card flex items-start gap-4 p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold uppercase tracking-wide">{s.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            </div>
            {i < steps.length - 1 ? (
              <div aria-hidden="true" className="my-1 flex justify-center text-primary/60">
                ↓
              </div>
            ) : null}
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

function IntegrationCard({
  name,
  text,
  note,
  slug,
}: {
  name: string;
  text: string;
  note: string;
  slug: string;
}) {
  return (
    <Link
      to="/integrations/$slug"
      params={{ slug }}
      className="surface-card block p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{name}</h3>
        <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          {note}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </Link>
  );
}

/* ------------------------------------------------------------------ */

function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
            Features
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            Everything You Need to Turn Cold Outreach Into{" "}
            <span className="text-gradient">Conversations</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {BRAND_NAME} combines campaigns, AI personalization, a unified inbox, CRM, automations,
            warmup, deliverability and analytics in one workspace — so your outbound runs as a
            single connected workflow instead of six disconnected tools.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">Start Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/how-it-works">See How It Works</Link>
            </Button>
          </div>

          <Reveal delay={100}>
            <div className="mt-14 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_40px_100px_-60px_hsl(var(--primary)/0.6)]">
              <img
                src={dashboardPreview}
                alt={`${BRAND_NAME} workspace showing campaigns, sending volume and reply performance`}
                className="w-full"
                width={1600}
                height={1000}
                loading="eager"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <FeatureNav items={navItems} />

      <FeatureBlock
        id="campaigns"
        index={1}
        icon={Send}
        eyebrow="Campaigns"
        title="Build multi-step campaigns that keep following up"
        description="The campaign builder holds the whole sequence: steps, wait windows, variants, the lead list, the email accounts that send it, and the schedule it runs on."
        points={[
          "Visual campaign builder",
          "Multi-step sequences",
          "Automatic follow-ups",
          "Sending schedule and time windows",
          "Lead lists attached per campaign",
          "Email accounts assigned per campaign",
          "Variables and personalization",
          "Pause, resume and stop controls",
          "Per-campaign analytics",
          "Follow-ups stop on reply",
        ]}
        cta="Create a Campaign"
        ctaTo="/signup"
      >
        <MockPanel title="Campaigns — Q3 Founders">
          <MockRows
            rows={[
              { left: "Step 1 · Intro email", muted: "Sends immediately", badge: "Live", right: "412 sent" },
              { left: "Step 2 · Follow-up", muted: "Wait 3 days", badge: "Live", right: "268 sent" },
              { left: "Step 3 · Break-up", muted: "Wait 5 days", badge: "Queued", right: "96 queued" },
            ]}
          />
          <div className="mt-4">
            <MockBars
              bars={[
                { label: "Sent", value: 92 },
                { label: "Delivered", value: 88 },
                { label: "Replies", value: 27 },
              ]}
            />
          </div>
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="ai-personalization"
        index={2}
        icon={Sparkles}
        eyebrow="AI Personalization"
        title="AI drafts the opener — you stay in control"
        description="Inside the campaign builder, AI uses the lead and company fields you imported to draft opening lines and tighten copy. Nothing sends on autopilot: every message is editable and previewable first."
        points={[
          "Personalized opening lines",
          "Uses lead and company context",
          "Personalization across a whole list",
          "Merge variables with fallbacks",
          "AI-assisted subject lines and copy",
          "Full human editing and overrides",
          "Preview per lead before launch",
          "Connect your own AI key",
        ]}
        muted
        flip
      >
        <MockPanel title="Campaign builder — Personalize">
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border/70 bg-background p-3.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Variables</p>
              <p className="mt-1 font-mono text-xs">
                {"{{first_name}} · {{company}} · {{title}} · {{custom_1}}"}
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/[0.05] p-3.5">
              <p className="text-xs uppercase tracking-wide text-primary">AI opening line</p>
              <p className="mt-1 text-foreground/90">
                &ldquo;Saw Northwind just opened a second fulfilment site — guessing outbound is
                back on the roadmap.&rdquo;
              </p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px]">Edit</span>
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px]">Regenerate</span>
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px]">Preview lead 4 / 240</span>
            </div>
          </div>
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="unified-inbox"
        index={3}
        icon={Inbox}
        eyebrow="Unified Inbox"
        title="Every reply from every mailbox in one thread view"
        description="Replies from all connected email accounts land in a single inbox with full conversation history, prospect context and the CRM record right beside the thread."
        points={[
          "All mailboxes in one inbox",
          "Threaded conversations",
          "Reply with CC and BCC",
          "Internal notes for your team",
          "Snooze and follow-up reminders",
          "Tags and conversation status",
          "Prospect details in context",
          "Linked CRM record and campaign",
        ]}
      >
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_30px_70px_-50px_hsl(var(--primary)/0.5)]">
          <img
            src={inboxPreview}
            alt={`${BRAND_NAME} unified inbox with threaded prospect replies and conversation context`}
            className="w-full"
            width={1600}
            height={1000}
            loading="lazy"
          />
        </div>
      </FeatureBlock>

      <FeatureBlock
        id="warmup"
        index={4}
        icon={Flame}
        eyebrow="Warmup"
        title="Ramp new email accounts at a controlled pace"
        description="Warmup increases volume gradually inside the limits you set and keeps reporting on mailbox health, so a brand-new account is never pushed straight to full sending volume."
        points={[
          "Controlled, gradual volume ramp",
          "Daily and hourly sending limits",
          "Mailbox health tracking",
          "Delivery monitoring over time",
          "Automatic safety caps",
          "Warmup status per account",
          "Pause and resume any time",
          "Per-mailbox controls",
        ]}
        muted
        flip
      >
        <MockPanel title="Warmup — Email accounts">
          <MockRows
            rows={[
              { left: "Email Account · outreach@", muted: "Day 12 of ramp", badge: "Warming", right: "24 / day" },
              { left: "Email Account · hello@", muted: "Ramp complete", badge: "Healthy", right: "60 / day" },
              { left: "Email Account · team@", muted: "Paused by you", badge: "Paused", right: "0 / day" },
            ]}
          />
          <div className="mt-4">
            <MockBars
              bars={[
                { label: "Volume vs. daily cap", value: 62 },
                { label: "Delivery reported", value: 96 },
                { label: "Mailbox health", value: 91 },
              ]}
            />
          </div>
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="crm"
        index={5}
        icon={Users}
        eyebrow="CRM"
        title="A pipeline that already knows the conversation"
        description="Contacts move through stages you define, with tasks, notes, activity history and the campaign that started the conversation attached to every record."
        points={[
          "Contact records",
          "Kanban pipeline",
          "Custom stages",
          "Tasks with due dates",
          "Notes for your team",
          "Activity timeline",
          "Full conversation history",
          "Campaign context on every contact",
        ]}
      >
        <MockPanel title="CRM — Pipeline">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { stage: "Interested", cards: ["Northwind — Ops", "Larkfield SaaS"] },
              { stage: "Meeting booked", cards: ["Bayline Group"] },
              { stage: "Proposal", cards: ["Cedar Labs", "Hartwell"] },
            ].map((col) => (
              <div key={col.stage} className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {col.stage}
                </p>
                <div className="mt-2 space-y-2">
                  {col.cards.map((c) => (
                    <div key={c} className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs">
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="automations"
        index={6}
        icon={Workflow}
        eyebrow="Automations"
        title="Trigger → conditions → actions"
        description="Automations react to what happens in your workspace. Pick a trigger, add conditions, then chain the actions that should run — no manual chasing between tools."
        points={[
          "Trigger: new lead added",
          "Trigger: reply or positive reply",
          "Trigger: campaign event",
          "Trigger: CRM stage changed or meeting booked",
          "Trigger: time delay",
          "Action: send follow-up, add tag, update contact",
          "Action: move CRM stage, create task",
          "Action: notify the team or fire an integration",
        ]}
        muted
        flip
      >
        <MockPanel title="Automation — Positive reply → pipeline">
          <div className="space-y-2 text-sm">
            {[
              { kind: "Trigger", text: "Reply received and classified positive" },
              { kind: "Condition", text: "Campaign is “Q3 Founders” and lead has no owner" },
              { kind: "Action", text: "Move CRM stage to “Interested”" },
              { kind: "Action", text: "Create task “Book call” due in 1 day" },
              { kind: "Action", text: "Notify the team channel" },
            ].map((row) => (
              <div
                key={row.text}
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
              >
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {row.kind}
                </span>
                <span className="text-foreground/90">{row.text}</span>
              </div>
            ))}
          </div>
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="analytics"
        index={7}
        icon={BarChart3}
        eyebrow="Analytics"
        title="Reporting built from real tracked events"
        description="Every metric comes from the delivery, open, click, reply, bounce and unsubscribe events recorded on your own sending. There are no sample numbers anywhere in reporting."
        points={[
          "Emails sent and delivered",
          "Opens and clicks",
          "Replies and positive replies",
          "Bounces and unsubscribes",
          "Reply, bounce and click rates",
          "Campaign-level performance",
          "Mailbox-level performance",
          "Date-range comparisons",
        ]}
      >
        <MockPanel title="Analytics — Last 30 days">
          <MockBars
            bars={[
              { label: "Sent", value: 100, caption: "4,820" },
              { label: "Delivered", value: 97, caption: "4,674" },
              { label: "Opens", value: 54, caption: "2,608" },
              { label: "Replies", value: 19, caption: "912" },
              { label: "Positive replies", value: 8, caption: "381" },
              { label: "Bounces", value: 2, caption: "96" },
            ]}
          />
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="email-accounts"
        index={8}
        icon={Globe}
        eyebrow="Email Accounts"
        title="Connect your own email accounts"
        description="Add the mailboxes you send from, test the connection, set per-account limits and watch their health from one screen."
        points={[
          "Connect your own email accounts",
          "Connection testing before sending",
          "Per-account daily and hourly limits",
          "Mailbox health and status",
          "Assign accounts to campaigns",
          "Pause a single account instantly",
          "Reply routing back to the inbox",
          "Account-level performance",
        ]}
        muted
        flip
      >
        <MockPanel title="Email accounts">
          <MockRows
            rows={[
              { left: "outreach@yourdomain.com", muted: "Connected · warming", badge: "Healthy", right: "24 / day" },
              { left: "hello@yourdomain.com", muted: "Connected", badge: "Healthy", right: "60 / day" },
              { left: "sales@yourdomain.com", muted: "Connection test needed", badge: "Check", right: "—" },
            ]}
          />
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="domains"
        index={9}
        icon={ShieldCheck}
        eyebrow="Domain Management"
        title="Your domain, verified step by step"
        description="Guided domain setup walks through each record with live checks, so authentication is verified before a single campaign goes out."
        points={[
          "Customer-owned sending domains",
          "Guided, step-by-step setup",
          "SPF verification",
          "DKIM verification",
          "DMARC verification",
          "Live DNS record checks",
          "Re-check and troubleshoot any record",
          "Alerts when authentication regresses",
        ]}
      >
        <MockPanel title="Domain setup — yourdomain.com">
          <MockRows
            rows={[
              { left: "SPF", muted: "TXT record found", badge: "Verified" },
              { left: "DKIM", muted: "Signing key published", badge: "Verified" },
              { left: "DMARC", muted: "Policy detected", badge: "Verified" },
              { left: "Tracking", muted: "CNAME pending propagation", badge: "Pending" },
            ]}
          />
        </MockPanel>
      </FeatureBlock>

      <Section
        id="integrations"
        muted
        title="Integrations"
        description="Connect MunchReach to the tools your team already runs. Some connections are part of the paid plans."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <IntegrationCard slug="openai" name="OpenAI" note="Bring your key" text="Use your own OpenAI key for AI personalization and copy assistance." />
          <IntegrationCard slug="slack" name="Slack" note="Available" text="Send reply and campaign notifications to a team channel." />
          <IntegrationCard slug="zapier" name="Zapier" note="Available" text="Push MunchReach events into thousands of downstream apps." />
          <IntegrationCard slug="make" name="Make" note="Available" text="Build custom scenarios from MunchReach webhooks." />
          <IntegrationCard slug="hubspot" name="HubSpot" note="Paid plans" text="Sync contacts and outreach activity with your HubSpot CRM." />
          <IntegrationCard slug="gohighlevel" name="GoHighLevel" note="Paid plans" text="Keep agency pipelines in sync with MunchReach conversations." />
          <IntegrationCard slug="calendly" name="Calendly" note="Available" text="Track booked meetings against the campaign that created them." />
          <IntegrationCard slug="google-sheets" name="Google Sheets" note="Available" text="Move leads and results between MunchReach and spreadsheets." />
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
          Availability depends on your plan.{" "}
          <Link to="/integrations" className="text-primary underline-offset-4 hover:underline">
            See all integrations
          </Link>{" "}
          or{" "}
          <Link to="/pricing" className="text-primary underline-offset-4 hover:underline">
            compare plans
          </Link>
          .
        </p>
      </Section>

      <FeatureBlock
        id="leads"
        index={10}
        icon={ListChecks}
        eyebrow="Lead Management"
        title="Lists, imports and clean data"
        description="Import leads, map your own fields, filter into segments and assign them to campaigns — with duplicates and suppressed contacts handled for you."
        points={[
          "Lead lists per client or segment",
          "CSV import with field mapping",
          "Custom lead fields",
          "Filtering and segmentation",
          "Assign leads to campaigns",
          "Lead activity timeline",
          "Suppression list",
          "Duplicate detection on import",
        ]}
        flip
      >
        <MockPanel title="Leads — Import">
          <MockRows
            rows={[
              { left: "founders-q3.csv", muted: "1,204 rows parsed", badge: "Mapped" },
              { left: "Duplicates skipped", muted: "Matched on email", right: "38" },
              { left: "Suppressed skipped", muted: "Unsubscribed or bounced", right: "12" },
              { left: "Ready to import", muted: "Assigned to “Q3 Founders”", badge: "1,154" },
            ]}
          />
        </MockPanel>
      </FeatureBlock>

      <FeatureBlock
        id="workspaces"
        index={11}
        icon={Building2}
        eyebrow="Workspaces & Teams"
        title="One login, separate workspaces"
        description="Each workspace keeps its own leads, campaigns, inbox, CRM and reporting. Invite teammates, give them a role, and collaborate without mixing client data."
        points={[
          "Separate workspaces per client or brand",
          "Invite team members by email",
          "Role-based permissions",
          "Shared campaigns",
          "Shared inbox",
          "Shared CRM",
          "Workspace-level sending settings",
          "Activity tracking across the team",
        ]}
        muted
      >
        <MockPanel title="Workspace — Team">
          <MockRows
            rows={[
              { left: "Ava Chen", muted: "ava@agency.com", badge: "Owner" },
              { left: "Marco Silva", muted: "marco@agency.com", badge: "Campaign manager" },
              { left: "Priya Raman", muted: "priya@agency.com", badge: "Inbox manager" },
              { left: "Client viewer", muted: "Read-only reporting access", badge: "Invited" },
            ]}
          />
        </MockPanel>
      </FeatureBlock>

      <Section
        id="security"
        title="Platform control and security"
        description="Sensible controls around your data, your domains and your team — without you having to run infrastructure."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Secure account access", text: "Email and social sign-in, session handling and password recovery built in." },
            { icon: Building2, title: "Workspace isolation", text: "Leads, campaigns, inboxes and reporting never cross between workspaces." },
            { icon: Globe, title: "Domain ownership", text: "You own the sending domain and the authentication records behind it." },
            { icon: Blocks, title: "Protected credentials", text: "Connection credentials are stored encrypted and never shown back in the app." },
            { icon: Users, title: "Permission controls", text: "Roles decide who can send, who can reply and who can only read reporting." },
            { icon: CalendarCheck, title: "Activity tracking", text: "Workspace activity and team actions are recorded for review." },
          ].map((item) => (
            <div key={item.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        muted
        title="One Workflow. One Workspace."
        description="Most teams stitch outbound together from six tools that never talk to each other. In MunchReach each stage feeds the next automatically."
      >
        <FlowStack
          steps={[
            { label: "Domain", text: "Add your sending domain and verify SPF, DKIM and DMARC." },
            { label: "Email account", text: "Connect the mailboxes that will send, with their own limits." },
            { label: "Leads", text: "Import and segment the people you want to reach." },
            { label: "Campaign", text: "Build the sequence, steps, delays and schedule." },
            { label: "AI personalization", text: "Draft openers from lead context, then edit and preview." },
            { label: "Warmup & sending", text: "Volume ramps inside safe limits while the sequence runs." },
            { label: "Unified inbox", text: "Replies land in one thread view and follow-ups stop automatically." },
            { label: "CRM", text: "Interested contacts move into the pipeline with full history." },
            { label: "Automations", text: "Stage changes, tasks, tags and notifications fire on their own." },
            { label: "Analytics", text: "Every step reports real numbers back into one dashboard." },
          ]}
        />
      </Section>

      <Section
        title="Built for modern outbound teams"
        description="The same workspace, shaped around how your team runs outreach."
      >
        <UseCaseGrid
          items={[
            { icon: Sparkles, audience: "Founders", scenario: "Running outbound yourself between everything else.", outcome: "Launch a sequence in an afternoon" },
            { icon: Send, audience: "Sales Teams", scenario: "Multiple reps sending from their own mailboxes.", outcome: "Shared inbox and pipeline" },
            { icon: Building2, audience: "Agencies", scenario: "Several clients, each with their own domains and data.", outcome: "One workspace per client" },
            { icon: ListChecks, audience: "Lead Generation Teams", scenario: "High-volume lists that need clean segmentation.", outcome: "Imports, filters and suppression" },
            { icon: Inbox, audience: "SDR Teams", scenario: "Reply volume that has to be worked the same day.", outcome: "Threaded replies with CRM context" },
            { icon: Users, audience: "Recruiting Teams", scenario: "Candidate outreach that needs long follow-up cycles.", outcome: "Sequences that stop on reply" },
          ]}
        />
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/solutions/$slug" params={{ slug: "sales-teams" }}>Sales teams</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/solutions/$slug" params={{ slug: "agencies" }}>Agencies</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/solutions/$slug" params={{ slug: "lead-generation" }}>Lead generation</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/solutions/$slug" params={{ slug: "recruiting" }}>Recruiting</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/solutions/$slug" params={{ slug: "saas" }}>SaaS</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/solutions/$slug" params={{ slug: "consultants" }}>Consultants</Link>
          </Button>
        </div>
      </Section>

      <TestimonialCarousel page="features" />

      <Section muted>
        <FaqBlock faqs={faqs} description="Common questions about the MunchReach feature set." />
      </Section>

      <CtaBlock
        title="Everything you need to build a better outbound engine."
        description="Domains, mailboxes, campaigns, AI personalization, replies, CRM, automations and analytics — in one workspace."
        cta="Start Free"
        secondaryCta="See How It Works"
        secondaryHref="/how-it-works"
      />
    </MarketingLayout>
  );
}
