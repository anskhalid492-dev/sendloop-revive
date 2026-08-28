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
  BarChart3,
  Inbox,
  Copy,
  MailWarning,
  PauseCircle,
  Rocket,
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
  Walkthrough,
  DocSection,
  metaFor,
  BigPreview,
  FeatureBento,
  WorkflowStrip,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "How many steps can a sequence have?", a: "As many as you need. Most teams see the best results with three to five steps spread over two weeks, mixing an intro, value follow-ups and a breakup email." },
  { q: "Do follow-ups stop when someone replies?", a: "Yes. A reply, bounce or unsubscribe stops the sequence for that lead instantly, and you can add your own stop conditions on top." },
  { q: "What is the campaign sending limit?", a: "It is the total number of emails one campaign may ever send, follow-ups included. The campaign stops itself automatically the moment it reaches that number." },
  { q: "What is the daily limit and how do I change it?", a: "It is the maximum a campaign may send in a single day. Every campaign row has a gauge icon that opens the daily limit so you can adjust it without opening the full campaign." },
  { q: "Which limit wins if they conflict?", a: "Always the lowest one: the campaign's daily limit, its total limit, your monthly plan allowance and the combined capacity of the mailboxes assigned to it." },
  { q: "Can I rotate multiple mailboxes in one campaign?", a: "Yes. Assign several sending accounts and MunchReach distributes volume across them based on the weights and per-mailbox caps you set, with automatic failover if one is paused." },
  { q: "Can I personalize every email with AI?", a: "Yes. Add your own OpenAI key in the campaign's AI tab and insert the AI personalization variable into any step. A safe fallback line is used whenever source data is missing." },
  { q: "What happens on a bounce?", a: "A hard bounce stops that lead's sequence, marks the address invalid workspace-wide so no other campaign contacts it, and is excluded from your reply-rate calculations." },
  { q: "What are the campaign states I'll see?", a: "Draft, Running, Daily quota reached, Waiting for next run and Completed. Each state is visible on the campaigns table so you always know why a campaign is or isn't sending." },
  { q: "Does a failed send retry automatically?", a: "Yes. Temporary delivery failures are retried automatically with backoff before being marked failed, so a brief mailbox or network hiccup doesn't cost you a lead." },
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
  { icon: ListX, title: "Spreadsheet chaos", text: "Tracking who got which email, and when, across a dozen tabs falls apart past 50 prospects — and nobody notices until a lead gets emailed twice." },
  { icon: AlertTriangle, title: "One mailbox, one ceiling", text: "Sending everything from a single account throttles volume and puts your entire domain reputation on the line for every campaign you run." },
  { icon: Repeat2, title: "No control over volume", text: "Without a real daily and total limit, a single campaign can burn through a whole month's sending allowance before lunch." },
  { icon: MailWarning, title: "Bounces poison the list", text: "A batch of bad addresses can tank deliverability for every campaign in the workspace if nothing is catching and stopping them." },
];

const walkthroughSteps = [
  {
    title: "Build the sequence",
    youDo: "Drag steps onto a timeline and set the delay between each — minutes, hours or days.",
    weHandle: "Conditional branching based on opens, clicks, replies or no activity, plus spintax and variable rendering per lead.",
    youGet: "A visual map of the exact journey every prospect will follow.",
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
    title: "Personalize every message",
    youDo: "Insert variables like {{firstName}} or {{company}}, add spintax, and drop in an AI personalization variable where you want a written-for-them opening line.",
    weHandle: "AI generates that line per lead using your own OpenAI key and falls back to a safe default sentence whenever source data is missing.",
    youGet: "Emails that read as written by a person, at send volume no person could type.",
    visual: (
      <MockPanel title="Step 1 · Personalization preview">
        <MockRows
          rows={[
            { left: "{{firstName}}, {{company}} caught my eye", muted: "Rendered subject", right: "Preview" },
            { left: "AI opener — hiring signal detected", muted: "Uses OpenAI key", badge: "Generated" },
            { left: "AI opener — no signal found", muted: "Fallback line used", badge: "Fallback" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Assign mailboxes and set limits",
    youDo: "Select one or more connected sending accounts and set a daily limit and a total limit for the campaign.",
    weHandle: "Volume is rotated across mailboxes by weight and warm-up-aware caps, and the lowest applicable limit — campaign, plan or mailbox — is always enforced.",
    youGet: "Predictable, safe volume with no single mailbox ever pushed past its cap.",
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
    title: "Set the schedule",
    youDo: "Choose sending days, a sending window and the delay between emails.",
    weHandle: "A throughput estimate shows the real per-hour, per-day and per-week volume the plan produces before you commit to it.",
    youGet: "A schedule that respects business hours and prospect time zones instead of blasting everyone at 3am.",
    visual: (
      <MockPanel title="Schedule — throughput estimate">
        <MockBars
          bars={[
            { label: "Per hour", value: 22, caption: "~18 emails" },
            { label: "Per day", value: 68, caption: "~500 emails" },
            { label: "Per week", value: 90, caption: "~2,500 emails" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Launch and let it run",
    youDo: "Click launch once the readiness checklist is green.",
    weHandle: "Sends run server-side, retry automatically on temporary failures, stop on reply or bounce, and pause the moment a limit is hit — resuming the next allowed day on their own.",
    youGet: "A campaign that runs unattended and tells you exactly what state it's in.",
    visual: (
      <MockPanel title="Campaign state — Q4 Outbound">
        <MockRows
          rows={[
            { left: "Status", right: "Daily quota reached", badge: "Paused" },
            { left: "Resumes", right: "Tomorrow, 9:00 AM", badge: "Scheduled" },
            { left: "Sent today", right: "500 / 500", badge: "Cap hit" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Read the results",
    youDo: "Open the campaign's analytics tab any time it's running.",
    weHandle: "Sent, opens, replies, positive replies, bounces and meetings booked are tracked per step and per variant, from real send data only.",
    youGet: "A clear read on what's working, so the next campaign starts stronger.",
    visual: (
      <MockPanel title="Campaign analytics — last 14 days">
        <MockBars
          bars={[
            { label: "Step 1 — reply rate", value: 18, caption: "18%" },
            { label: "Step 2 — reply rate", value: 31, caption: "31% · Best step" },
            { label: "Step 3 — reply rate", value: 12, caption: "12%" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Layers, title: "Visual sequence builder", text: "Drag steps, set delays in minutes, hours or days, and preview the full journey per prospect before it goes live." },
  { icon: Split, title: "Conditional branching", text: "Branch on opened, clicked, replied, bounced or no-activity and send a different follow-up down each path." },
  { icon: Gauge, title: "Daily and total sending limits", text: "Set a total campaign limit and a daily limit, editable straight from the campaigns table. Follow-ups count toward both, and sending stops automatically at the cap." },
  { icon: Clock, title: "Schedule & throughput", text: "Choose sending days, a sending window and delays, then see the real per-hour, per-day and per-week throughput before you launch." },
  { icon: Shuffle, title: "Mailbox rotation", text: "Spread volume across connected accounts with per-account daily caps, weighting and warm-up-aware throttling." },
  { icon: Sparkles, title: "AI personalization", text: "Bring your own OpenAI key and insert an AI-written opening line into any step, with a safe fallback whenever lead data is missing." },
  { icon: Beaker, title: "A/B/n testing", text: "Test up to five subject lines or bodies per step and let reply-rate data promote the winner automatically." },
  { icon: Repeat2, title: "Automatic retries", text: "Temporary delivery failures are retried with backoff before ever being marked failed, so a brief mailbox hiccup doesn't lose a lead." },
  { icon: ShieldCheck, title: "Bounce protection", text: "Hard bounces stop that lead's sequence, mark the address invalid workspace-wide and are excluded from your analytics." },
  { icon: PauseCircle, title: "Clear campaign states", text: "Every campaign shows exactly what's happening: Running, Daily quota reached, Waiting for next run or Completed." },
  { icon: Inbox, title: "Live send queue", text: "Watch every queued, sent, skipped and failed message in real time, with the reason behind each outcome." },
  { icon: BarChart3, title: "Campaign analytics", text: "Sent, opens, replies, reply rate, positive replies and meetings booked per campaign and per step, from real send data only." },
  { icon: Copy, title: "Duplicate & bulk actions", text: "Clone a winning sequence for a new list, or pause, resume, archive and delete campaigns in bulk." },
];

const workflowSteps = [
  { title: "Import leads", text: "Pull in a list or filter existing leads by tag, industry, status or custom field." },
  { title: "Write the sequence", text: "Draft the first email and chain follow-ups with variables, spintax and AI openers." },
  { title: "Assign mailboxes", text: "Attach one or more warmed sending accounts to rotate volume across." },
  { title: "Set limits & schedule", text: "Choose the total limit, daily limit, sending days and sending window." },
  { title: "Launch", text: "The readiness checklist confirms leads, steps, mailboxes, schedule and limits are all set." },
  { title: "Send & retry", text: "Emails go out on schedule; temporary failures retry automatically with backoff." },
  { title: "Protect the list", text: "Replies, bounces and unsubscribes stop that lead's sequence immediately." },
  { title: "Review & iterate", text: "Read step-level analytics, promote the winning variant and clone the sequence for the next list." },
];

const useCases = [
  {
    icon: Rocket,
    audience: "Founders selling early",
    scenario: "You are the only rep and need 20 real conversations a week without living in your inbox.",
    outcome: "Launch a 4-step sequence with a daily limit in under 10 minutes.",
  },
  {
    audience: "Outbound sales teams",
    scenario: "Several reps, shared lead lists and dozens of campaigns running at once.",
    outcome: "Per-campaign limits and mailbox rotation keep every rep inside a safe sending ceiling.",
  },
  {
    audience: "Lead gen agencies",
    scenario: "Separate client sequences, mailboxes and reporting that must never mix.",
    outcome: "One workspace per client with isolated mailboxes, limits and analytics.",
  },
  {
    audience: "Recruiters running outreach",
    scenario: "Sourcing candidates or clients at volume without sounding like a mail merge.",
    outcome: "AI personalization and variables make each message feel individually written.",
  },
  {
    audience: "Growth teams testing offers",
    scenario: "Need to know which subject line or angle actually gets replies before scaling spend.",
    outcome: "A/B/n testing surfaces the winning variant with real reply-rate data.",
  },
  {
    audience: "Teams recovering a sender reputation",
    scenario: "A prior mailbox got flagged and volume needs to ramp back up carefully.",
    outcome: "Conservative daily limits and mailbox rotation rebuild volume without another flag.",
  },
];

const capabilityGroups = [
  {
    title: "Sequencing & delivery",
    items: [
      "Unlimited steps with conditional branching",
      "Delays set in minutes, hours or days",
      "Mailbox rotation with per-account caps and weighting",
      "Automatic retries with backoff on temporary failures",
      "Timezone-aware scheduling per prospect",
    ],
  },
  {
    title: "Limits & campaign states",
    items: [
      "Daily sending limit, editable from the campaigns table",
      "Total campaign limit, follow-ups included",
      "Lowest limit always wins: campaign, plan or mailbox",
      "States shown per campaign: Running, Daily quota reached, Waiting for next run, Completed",
      "Automatic pause and resume when a limit or schedule window is hit",
    ],
  },
  {
    title: "Personalization & protection",
    items: [
      "Custom variables and spintax with fallbacks",
      "AI personalization using your own OpenAI key",
      "A/B/n testing with automatic winner promotion",
      "Bounce protection with workspace-wide suppression",
      "Instant stop on reply, bounce or unsubscribe",
    ],
  },
];

const bullets = [
  "Unlimited steps per sequence",
  "Spintax and custom variables with safe fallbacks",
  "Total and daily sending limits per campaign, follow-ups included",
  "AI personalization with your own OpenAI key",
  "Automatic retries on temporary send failures",
  "Bounce protection with workspace-wide suppression",
  "Live campaign states: Running, Daily quota reached, Waiting for next run, Completed",
  "Throughput estimate before you launch",
  "Duplicate and suppression checks before every send",
  "Pause, resume, clone and archive — one at a time or in bulk",
];

const beforeAfter = {
  before: [
    "Sequences live in spreadsheets and nobody knows who got which email",
    "One mailbox caps you at roughly 50 sends a day before reputation slips",
    "Follow-ups keep firing after a prospect already replied",
    "A single campaign can burn through the whole month's sending allowance",
    "A temporary send error quietly loses a lead from the sequence",
  ],
  after: [
    "Every step, delay and branch is visible on one timeline",
    "Volume spreads across warmed mailboxes with per-account caps",
    "Reply, bounce and unsubscribe stop the sequence instantly",
    "Daily and total limits keep every campaign inside your plan",
    "Temporary failures retry automatically before ever counting as lost",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Campaigns"
        title="Multi-step cold email"
        highlight="campaigns that convert"
        description="Build sequences with delays, branching and follow-ups, personalize with AI, rotate across mailboxes and control exactly how much and how often each campaign sends."
        benefits={[
          "Daily and total sending limits per campaign",
          "Mailbox rotation with warm-up-aware caps",
          "AI personalization and automatic retries",
        ]}
        primaryCta="Start for Free"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="Campaign builder"
        title="See the campaign builder"
        description="Sequence steps, mailbox rotation, limits and schedule in one screen — with the campaign's live state front and center."
      >
        <MockPanel title="Q4 Outbound — SaaS Founders">
          <MockRows
            rows={[
              { left: "Status", right: "Running", badge: "Active" },
              { left: "Step 1 · Intro email", right: "Day 0", badge: "Sent" },
              { left: "Step 2 · Value follow-up", right: "Day 3", badge: "Sent" },
              { left: "Step 3 · Case study (opened branch)", right: "Day 6", badge: "Queued" },
              { left: "Daily limit", muted: "Follow-ups included", right: "312 / 500", badge: "On track" },
            ]}
          />
        </MockPanel>
      </BigPreview>
      <Section title="Why cold email campaigns stall">
        <PainPoints items={painPoints} />
      </Section>
      <Section
        id="how-it-works"
        title="How a campaign goes from idea to inbox"
        description="One builder for sequencing, personalization, limits and mailbox rotation."
      >
        <Walkthrough steps={walkthroughSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="The end-to-end workflow" description="What actually happens between import and inbox.">
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep capabilities" description="What's under the hood of every campaign you run.">
        <DocSection groups={capabilityGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch.">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="campaigns" title="Teams shipping campaigns with MunchReach" />
      <Section muted>
        <PageFaqs page="campaigns" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Launch your first campaign today"
        description="Import a list, write a three-step sequence, connect a mailbox and set a daily limit — you'll be sending inside ten minutes."
      />
    </MarketingLayout>
  );
}
