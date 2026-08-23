import { createFileRoute } from "@tanstack/react-router";
import {
  Layers,
  Split,
  Clock,
  Beaker,
  Shuffle,
  ShieldCheck,
  AlertTriangle,
  ListX,
  Repeat2,
  Gauge,
  Sparkles,
  ListChecks,
  BarChart3,
  Inbox,
  Copy,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  MarketingLayout,
  MockBars,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  BeforeAfter,
  UseCaseGrid,
  Section,
  SolutionSplit,
  StatStrip,
  StepList,
  DocSection,
  Prose,
  metaFor,
  BigPreview,
  FeatureBento,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "How many steps can a sequence have?", a: "As many as you need. Most teams see the best results with three to five steps spread over two weeks." },
  { q: "Do follow-ups stop when someone replies?", a: "Yes. Reply, bounce and unsubscribe stop the sequence instantly, and you can add custom stop conditions." },
  { q: "What is the campaign sending limit?", a: "It is the total number of emails one campaign may send, follow-ups included. The campaign stops automatically when it reaches that number." },
  { q: "What is the daily limit shortcut?", a: "Every campaign row has a gauge icon that opens the daily sending limit. Set how many emails that campaign may send per day and save it without opening the campaign." },
  { q: "Which limit wins if they conflict?", a: "Always the lowest one: the campaign daily limit, the campaign total limit, your monthly plan allowance and the capacity of your connected mailboxes." },
  { q: "Can I rotate multiple mailboxes in one campaign?", a: "Yes. Assign several sending accounts and MunchReach distributes volume based on the limits and weights you set." },
  { q: "Can I personalise every email with AI?", a: "Yes. Add your own OpenAI key in the campaign AI tab and insert the AI personalization variable into any step; a safe fallback is used when data is missing." },
  { q: "Can I test subject lines?", a: "Yes. Add variants to any step and the winner is promoted automatically once enough data is collected." },
];

export const Route = createFileRoute("/product/campaigns")({
  head: () =>
    metaFor(
      "Cold Email Campaigns That Convert | MunchReach",
      "Build multi-step cold email campaigns with follow-ups, mailbox rotation, AI personalization, send limits and live analytics — all in one workspace.",
      "/product/campaigns",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: ListX, title: "Spreadsheet chaos", text: "Tracking who got which email, and when, across a dozen tabs is unmanageable past 50 prospects." },
  { icon: AlertTriangle, title: "One mailbox, one ceiling", text: "Sending everything from a single account throttles volume and puts your whole domain reputation at risk." },
  { icon: Repeat2, title: "No control over volume", text: "Without a real limit, a single campaign can eat your whole monthly allowance in a morning." },
];

const solutionRows = [
  {
    eyebrow: "Sequence builder",
    title: "Design the full journey, not just one email",
    text: "Drag steps onto a timeline, set delays in minutes, hours or days, and branch based on what a prospect actually does.",
    bullets: [
      "Unlimited steps with conditional branches",
      "Opened, clicked, replied or no-activity paths",
      "Live preview of the exact journey per prospect",
    ],
    visual: (
      <MockPanel title="Q4 Outbound — SaaS Founders">
        <MockRows
          rows={[
            { left: "Step 1 · Intro email", right: "Day 0", badge: "Sent" },
            { left: "Step 2 · Value follow-up", right: "Day 3", badge: "Sent" },
            { left: "Step 3 · Case study (opened branch)", right: "Day 6", badge: "Queued" },
            { left: "Step 4 · Breakup email", right: "Day 11", badge: "Scheduled" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Sending limits",
    title: "You decide how much each campaign sends",
    text: "Set a total sending limit for the campaign and a daily limit you can change straight from the campaigns table. Follow-ups count toward both, and sending stops on its own when a limit is reached.",
    bullets: [
      "Total campaign limit, follow-ups included",
      "One-click daily limit with live usage",
      "Lowest limit always wins — campaign, plan or mailbox",
    ],
    visual: (
      <MockPanel title="Daily sending limit — Q4 Outbound">
        <MockRows
          rows={[
            { left: "Daily limit", muted: "Follow-ups included", right: "500 / day", badge: "Saved" },
            { left: "Used today", right: "125 / 500", badge: "Sending" },
            { left: "Mailbox capacity", muted: "3 accounts connected", right: "200 / day", badge: "Ceiling" },
            { left: "Monthly allowance left", right: "7,500 emails", badge: "Plan" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Mailbox rotation",
    title: "Scale volume without burning a single account",
    text: "Assign several sending accounts to one campaign. MunchReach distributes sends by weight, respects each mailbox's warmed-up cap, and rebalances automatically if one account slows down.",
    bullets: [
      "Per-mailbox daily caps and weighting",
      "Automatic throttling as warmup progresses",
      "Failover if a mailbox is paused or flagged",
    ],
    visual: (
      <MockPanel title="Mailbox rotation — today's send plan">
        <MockRows
          rows={[
            { left: "sam@munchreach.dev", muted: "Warmed 41 days", right: "62 / 65 sent", badge: "Healthy" },
            { left: "hello@munchreachmail.com", muted: "Warmed 12 days", right: "24 / 25 sent", badge: "Ramping" },
            { left: "outreach@getmunchreach.io", muted: "Warmed 58 days", right: "78 / 80 sent", badge: "Healthy" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "A/B/n testing",
    title: "Let the data pick your best angle",
    text: "Run up to five variants of any subject line or body per step. MunchReach tracks reply rate per variant and automatically promotes the winner once results are statistically meaningful.",
    visual: (
      <MockPanel title="Step 1 · Variant performance">
        <MockBars
          bars={[
            { label: "Variant A — \"Quick question, {{firstName}}\"", value: 18, caption: "18% reply" },
            { label: "Variant B — \"Saw you're hiring for...\"", value: 31, caption: "31% reply · Winner" },
            { label: "Variant C — \"Idea for {{company}}\"", value: 12, caption: "12% reply" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Layers, title: "Visual sequence builder", text: "Drag steps, set delays in minutes, hours or days, and preview the full journey per prospect." },
  { icon: Split, title: "Conditional branching", text: "Branch on opened, clicked, replied, bounced or no-activity and send a different message to each path." },
  { icon: Gauge, title: "Campaign send limits", text: "Set a total limit and a daily limit per campaign. Follow-ups count, and sending stops automatically at the cap." },
  { icon: Clock, title: "Schedule & throughput", text: "Choose sending days, a sending window and delays, then see the real per-hour, per-day and per-week throughput before you launch." },
  { icon: Sparkles, title: "AI personalization", text: "Bring your own OpenAI key and insert an AI-written opening line into any step, with a safe fallback when data is missing." },
  { icon: Beaker, title: "A/B/n testing", text: "Test up to five subject lines or bodies per step and auto-promote the winner by reply rate." },
  { icon: Shuffle, title: "Mailbox rotation", text: "Spread volume across connected accounts with per-account daily caps, weights and warmup-aware throttling." },
  { icon: ListChecks, title: "Launch readiness checks", text: "A pre-flight bar confirms mailboxes, leads, steps, schedule and limits before the campaign can go live." },
  { icon: Inbox, title: "Live send queue", text: "Watch every queued, sent, failed and skipped message in real time with the reason for each outcome." },
  { icon: BarChart3, title: "Campaign analytics", text: "Sent, replies, reply rate, positive replies and meetings booked per campaign — from real send data only." },
  { icon: Copy, title: "Duplicate & bulk actions", text: "Clone a winning sequence for a new list, or pause, resume, archive and delete campaigns in bulk." },
  { icon: ShieldCheck, title: "Safety guardrails", text: "Automatic stop on reply, bounce or unsubscribe plus workspace-wide suppression and duplicate checks." },
];

const steps = [
  { title: "Pick your audience", text: "Select a lead list or filter by tags, industry, status and custom fields." },
  { title: "Write step one", text: "Use variables, spintax and AI icebreakers with safe fallbacks for missing data." },
  { title: "Add follow-ups", text: "Chain conditional steps with your own delays and stop rules." },
  { title: "Set your limits", text: "Choose the total campaign limit and the daily limit; the monthly allowance is applied for you." },
  { title: "Launch and monitor", text: "Sends run server-side while opens, clicks and replies stream into analytics." },
];

const guide = [
  {
    heading: "1. Create the campaign",
    body: [
      "Go to Campaigns and choose New campaign. Give it a name you will recognise later — the client, the offer or the quarter — and add a short description so your team knows who it targets.",
      "The campaign opens in draft. Nothing is sent until you launch it, so you can leave it and come back at any time.",
    ],
  },
  {
    heading: "2. Add leads",
    body: [
      "In the Leads tab, pick an existing list or filter your leads by tag, status, industry or any custom field. Duplicates and suppressed addresses are removed before launch, so the same person is never contacted twice from your workspace.",
      "Every field you import — first name, company, role, website — becomes a variable you can use in your emails.",
    ],
  },
  {
    heading: "3. Write the sequence",
    body: [
      "Step one is your first email. Add follow-up steps below it and set the delay for each one; three to five steps over two weeks works for most teams.",
      "Insert variables like {{firstName}} or {{company}}, add spintax for natural variation, and add up to five subject-line variants per step if you want to test angles. Use Preview to see a real prospect's version of each email before you send.",
    ],
  },
  {
    heading: "4. Choose sending accounts",
    body: [
      "In the Accounts tab, select one or more connected mailboxes. Adding several mailboxes spreads the volume so no single account is pushed past its warmed-up daily cap.",
      "Only mailboxes on verified domains can send, and mailboxes still in warmup contribute the volume their current ramp allows.",
    ],
  },
  {
    heading: "5. Set the schedule and limits",
    body: [
      "In the Schedule tab, pick your sending days, your sending window and the delay between emails. The throughput estimate shows how many emails that plan produces per hour, per day and per week — and tells you when your mailbox capacity, not your choice, is the limiting factor.",
      "In Options, set the total campaign sending limit: how many emails this campaign may ever send, follow-ups included. You can also set a daily limit and change it any time from the gauge icon in the campaigns table.",
    ],
  },
  {
    heading: "6. Launch and watch it run",
    body: [
      "The launch readiness bar confirms you have leads, at least one step, a sending account, a schedule and a limit. Once everything is green, launch.",
      "The Queue tab shows every message as it is scheduled, sent, skipped or failed. Replies land in the Unified Inbox, stop the follow-ups for that lead automatically and update the lead in your CRM.",
    ],
  },
];

const limitGroups = [
  {
    title: "Campaign daily limit",
    items: [
      "Set from the gauge icon in the campaigns table",
      "Shows today's usage as you send",
      "Follow-ups count toward it",
      "Save and it applies to the very next send",
    ],
  },
  {
    title: "Campaign total limit",
    items: [
      "The total emails this campaign may ever send",
      "Includes every follow-up step",
      "Campaign stops itself at the limit",
      "Raise it any time to keep sending",
    ],
  },
  {
    title: "Plan and mailbox ceilings",
    items: [
      "Your monthly plan allowance is applied automatically",
      "Each mailbox keeps its own warmed-up daily cap",
      "Warmup traffic never touches campaign volume",
      "The lowest applicable limit always wins",
    ],
  },
];

const bullets = [
  "Unlimited steps per sequence",
  "Spintax and custom variables with fallbacks",
  "Total and daily sending limits per campaign, follow-ups included",
  "Throughput estimate before you launch",
  "AI personalization with your own key",
  "Duplicate and suppression checks before launch",
  "Pause, resume, clone and archive any campaign — one at a time or in bulk",
  "Timezone-aware scheduling per prospect",
];

const beforeAfter = {
  before: [
    "Sequences live in spreadsheets and nobody knows who got which email",
    "One mailbox caps you at ~50 sends a day before reputation slips",
    "Follow-ups keep firing after a prospect already replied",
    "A single campaign burns through the whole month's sending allowance",
  ],
  after: [
    "Every step, delay and branch is visible on one timeline",
    "Volume spreads across warmed mailboxes with per-account caps",
    "Reply, bounce and unsubscribe stop the sequence instantly",
    "Daily and total limits keep every campaign inside your plan",
  ],
};

const useCases = [
  {
    audience: "Founders selling early",
    scenario: "You are the only rep and need 20 conversations a week without living in your inbox.",
    outcome: "Launch a 4-step sequence in under 10 minutes.",
  },
  {
    audience: "Outbound teams",
    scenario: "Five reps, shared lists and overlapping prospects across dozens of campaigns.",
    outcome: "Workspace-wide dedupe, suppression and per-campaign limits before every send.",
  },
  {
    audience: "Lead gen agencies",
    scenario: "Separate client sequences, mailboxes and reporting that must never mix.",
    outcome: "One workspace per client with isolated data, mailboxes and sending caps.",
  },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Campaigns"
        title="Multi-step cold email"
        highlight="campaigns that convert"
        description="Build sequences with delays, conditions and A/B variants, personalise with AI, rotate across mailboxes and control exactly how much each campaign sends."
        secondaryCta="Explore Campaigns"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Campaign builder"
        title="See the campaign builder"
        description="Sequence steps, variants, mailbox rotation, limits and schedule in one screen."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="Why cold email campaigns stall">
        <PainPoints items={painPoints} />
      </Section>
      <Section title="How MunchReach solves it" description="One builder for sequencing, limits, testing and mailbox rotation.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
        <div className="mt-12">
          <StepList steps={steps} />
        </div>
      </Section>
      <Section
        title="Quick start guide"
        description="From an empty workspace to a live campaign in six steps."
        muted
      >
        <Prose sections={guide} />
      </Section>
      <Section
        title="How sending limits work together"
        description="You choose the numbers; MunchReach applies the lowest one automatically."
      >
        <DocSection groups={limitGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section>
        <StatStrip
          stats={[
            { value: "3.4x", label: "More replies vs. single-mailbox sending" },
            { value: "12k+", label: "Campaigns launched on MunchReach" },
            { value: "99.2%", label: "Sequences that stop cleanly on reply" },
            { value: "<10 min", label: "Median time to launch a new campaign" },
          ]}
        />
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <TestimonialCarousel page="campaigns" title="Teams shipping campaigns with MunchReach" />
      <Section muted>
        <PageFaqs page="campaigns" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Launch your first campaign today"
        description="Connect a mailbox, import a list and send your first sequence in under ten minutes."
      />
    </MarketingLayout>
  );
}
