import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  Flame,
  Globe,
  Inbox,
  ListChecks,
  Mail,
  Repeat,
  Rocket,
  Send,
  ServerCog,
  Sparkles,
  Users,
} from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  WorkflowStrip,
  SolutionSplit,
  MockPanel,
  MockRows,
  MockBars,
  CtaBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";


export const Route = createFileRoute("/how-it-works")({
  head: () =>
    metaFor(
      "How Sendloop Works — From Setup to Replies in 12 Steps",
      "Workspace, domain, DNS, mailboxes, leads, campaign, AI personalization, launch, inbox, analytics, CRM and automation — the full Sendloop journey.",
      "/how-it-works",
    ),
  component: HowItWorks,
});

const phases = [
  { title: "Set up", text: "Workspace, domain, DNS and mailboxes — the foundation everything else sends on." },
  { title: "Build", text: "Import leads, write the sequence, personalize with AI and test before launch." },
  { title: "Send", text: "Launch with pacing, rotation and sending windows across your connected mailboxes." },
  { title: "Convert", text: "Work replies in the Unified Inbox and move real conversations through the CRM." },
  { title: "Improve", text: "Read analytics, automate what repeats, and adjust the next campaign on evidence." },
];

const steps = [
  {
    n: 1,
    icon: Building2,
    title: "Create your workspace",
    text: "A workspace holds your domains, mailboxes, leads, campaigns and reporting. Agencies create one per client so nothing crosses over.",
  },
  {
    n: 2,
    icon: Globe,
    title: "Connect your domain",
    text: "Add a domain you own. It's the identity your prospects see and the reputation you keep, whichever provider you send through.",
  },
  {
    n: 3,
    icon: ServerCog,
    title: "Configure DNS",
    text: "Add the SPF, DKIM and DMARC records Sendloop generates. Verification has to pass before the domain can be used for sending.",
  },
  {
    n: 4,
    icon: Mail,
    title: "Connect your email accounts",
    text: "Bring your own mailboxes over SMTP or an API provider. Credentials are stored encrypted and tested before the account is enabled.",
  },
  {
    n: 5,
    icon: Flame,
    title: "Warm up the mailboxes",
    text: "Warmup ramps volume gradually and scores account health, so a new mailbox never jumps straight into a full campaign.",
  },
  {
    n: 6,
    icon: ListChecks,
    title: "Add or import leads",
    text: "Import a CSV or add leads by hand into lists. Custom fields imported here become the variables you personalize with.",
  },
  {
    n: 7,
    icon: Send,
    title: "Build your campaign",
    text: "Compose the sequence: steps, wait intervals, variants, sending window and which mailboxes carry the volume.",
  },
  {
    n: 8,
    icon: Sparkles,
    title: "Personalize with AI",
    text: "Generate opening lines from the lead fields you imported, then preview each message with real data and check for unresolved variables.",
  },
  {
    n: 9,
    icon: Rocket,
    title: "Launch outreach",
    text: "Sendloop schedules sends across accounts, respects daily caps and pauses anything whose deliverability signals go the wrong way.",
  },
  {
    n: 10,
    icon: Inbox,
    title: "Manage replies in the Unified Inbox",
    text: "Every reply from every mailbox lands in one threaded view. Answering stops the remaining follow-ups automatically.",
  },
  {
    n: 11,
    icon: Users,
    title: "Manage prospects in the CRM",
    text: "Replies become contacts on a pipeline with stages, tasks, notes and an activity timeline your whole team can see.",
  },
  {
    n: 12,
    icon: BarChart3,
    title: "Track analytics and automate",
    text: "Read the funnel by campaign and mailbox, then turn the repeatable parts into automations that run on triggers and conditions.",
  },
];

const screens = [
  {
    eyebrow: "Setup",
    title: "Verified domains before a single send",
    text: "Sendloop shows exactly which records are missing and re-checks until the domain passes. No campaign can go out on an unverified domain.",
    bullets: ["Generated SPF, DKIM and DMARC records", "Re-check on demand", "Per-domain mailbox list and health"],
    visual: (
      <MockPanel title="Domains — yourdomain.com">
        <MockRows
          rows={[
            { left: "SPF", muted: "Found on yourdomain.com", badge: "Verified" },
            { left: "DKIM", muted: "sendloop._domainkey", badge: "Verified" },
            { left: "DMARC", muted: "p=quarantine", badge: "Verified" },
            { left: "Mailboxes on this domain", muted: "3 connected · 2 warming", right: "View" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Build",
    title: "Preview every message with real lead data",
    text: "Before launch, render each step against an actual lead, run a test send from the mailbox that would deliver it, and see any variable that failed to resolve.",
    bullets: ["Step-by-step preview", "Test send with delivery diagnostics", "Unresolved variable report"],
    visual: (
      <MockPanel title="Campaign — Q3 agencies">
        <MockRows
          rows={[
            { left: "Step 1 — Intro", muted: "Sends immediately", badge: "Ready" },
            { left: "Step 2 — Follow-up", muted: "Wait 3 days", badge: "Ready" },
            { left: "Step 3 — Break-up", muted: "Wait 5 days", badge: "Ready" },
            { left: "Variables", muted: "first_name, company, industry", badge: "All resolved" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Convert",
    title: "Replies in one inbox, follow-ups stopped automatically",
    text: "The Unified Inbox threads inbound replies against the campaign and prospect that produced them, so whoever picks it up has the full history.",
    bullets: ["All mailboxes in one view", "Sequence stops on reply", "Notes and CRM stage from the same screen"],
    visual: (
      <MockPanel title="Unified Inbox">
        <MockRows
          rows={[
            { left: "Re: quick question", muted: "maria@northbridge.io", badge: "Interested" },
            { left: "Re: intro", muted: "dan@lumenworks.com", badge: "Meeting" },
            { left: "Out of office", muted: "ops@fieldstone.co", badge: "Snoozed" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Improve",
    title: "A funnel that explains the result",
    text: "Sent, delivered, opened, replied and bounced, broken down by campaign, step and mailbox — so the next iteration is a decision, not a guess.",
    bullets: ["Conversion funnel by campaign", "Per-mailbox deliverability", "Trends across any date range"],
    visual: (
      <MockPanel title="Analytics">
        <MockBars
          bars={[
            { label: "Sent", value: 100, caption: "4,120" },
            { label: "Delivered", value: 97, caption: "3,996" },
            { label: "Opened", value: 52, caption: "2,143" },
            { label: "Replied", value: 12, caption: "494" },
          ]}
        />
      </MockPanel>
    ),
  },
];

function HowItWorks() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="How it works"
        title="From an empty workspace to"
        highlight="replies you can work"
        description="Twelve steps, in the order you'll actually do them: set up sending you own, build a campaign worth sending, then handle the conversations it creates."
        primaryCta="Start Sending"
      />

      <Section
        title="The journey"
        description="Setup → campaign → replies → meetings → analytics. Everything below sits inside one of these five phases."
      >
        <WorkflowStrip steps={phases} />
      </Section>

      <Section muted title="The twelve steps" description="Each one lives in the same workspace — no exports between stages.">
        <ol className="relative mx-auto max-w-4xl space-y-4 sm:before:absolute sm:before:bottom-6 sm:before:left-[27px] sm:before:top-6 sm:before:w-px sm:before:bg-border">
          {steps.map((s) => (
            <li key={s.n} className="relative flex gap-4 sm:gap-6">
              <span className="relative z-10 flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm">
                <s.icon className="size-5" />
                <span className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                  {String(s.n).padStart(2, "0")}
                </span>
              </span>
              <div className="surface-card flex-1 p-5">
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="What it looks like in the product">
        <SolutionSplit rows={screens} />
      </Section>

      <Section muted title="Then it keeps running">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            { icon: Repeat, title: "Automations", text: "Triggers, conditions, waits and actions handle the follow-through." },
            { icon: Flame, title: "Warmup", text: "Health scoring continues on every connected mailbox, not just new ones." },
            { icon: BarChart3, title: "Reporting", text: "Each campaign feeds the same analytics, so trends survive iteration." },
          ].map((c) => (
            <div key={c.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <c.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <TestimonialCarousel page="how-it-works" />


      <CtaBlock
        title="Start Sending"
        description="Create a free workspace, verify a domain and send your first campaign from a mailbox you own."
      />
    </MarketingLayout>
  );
}
