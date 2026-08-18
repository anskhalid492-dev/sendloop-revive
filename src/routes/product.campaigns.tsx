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
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  MockBars,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  StatStrip,
  StepList,
  metaFor,
  BigPreview,
  FeatureBento,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  { q: "How many steps can a sequence have?", a: "As many as you need. Most teams see the best results with three to five steps spread over two weeks." },
  { q: "Do follow-ups stop when someone replies?", a: "Yes. Reply, bounce and unsubscribe stop the sequence instantly, and you can add custom stop conditions." },
  { q: "Can I rotate multiple mailboxes in one campaign?", a: "Yes. Assign several sending accounts and Sendloop distributes volume based on the limits and weights you set." },
  { q: "Can I test subject lines?", a: "Yes. Add variants to any step and the winner is promoted automatically once enough data is collected." },
  { q: "Will rotation hurt my domain reputation?", a: "No — rotation respects each mailbox's warmed-up daily cap, so no single account ever gets overloaded." },
  { q: "Can I clone a winning campaign for a new list?", a: "Yes. Duplicate any campaign, swap the audience, and Sendloop resets analytics while keeping your sequence logic." },
];

export const Route = createFileRoute("/product/campaigns")({
  head: () =>
    metaFor(
      "Cold Email Campaign & Sequence Builder — Sendloop",
      "Build multi-step cold email campaigns with branching, A/B variants and mailbox rotation that protects deliverability.",
      "/product/campaigns",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: ListX, title: "Spreadsheet chaos", text: "Tracking who got which email, and when, across a dozen tabs is unmanageable past 50 prospects." },
  { icon: AlertTriangle, title: "One mailbox, one ceiling", text: "Sending everything from a single account throttles volume and puts your whole domain reputation at risk." },
  { icon: Repeat2, title: "Guessing what works", text: "Without built-in testing, you never know if a different subject line or angle would have doubled replies." },
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
    eyebrow: "Mailbox rotation",
    title: "Scale volume without burning a single account",
    text: "Assign several sending accounts to one campaign. Sendloop distributes sends by weight, respects each mailbox's warmed-up cap, and rebalances automatically if one account slows down.",
    bullets: [
      "Per-mailbox daily caps and weighting",
      "Automatic throttling as warmup progresses",
      "Failover if a mailbox is paused or flagged",
    ],
    visual: (
      <MockPanel title="Mailbox rotation — today's send plan">
        <MockRows
          rows={[
            { left: "sam@sendloop.dev", muted: "Warmed 41 days", right: "62 / 65 sent", badge: "Healthy" },
            { left: "hello@sendloopmail.com", muted: "Warmed 12 days", right: "24 / 25 sent", badge: "Ramping" },
            { left: "outreach@getsendloop.io", muted: "Warmed 58 days", right: "78 / 80 sent", badge: "Healthy" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "A/B/n testing",
    title: "Let the data pick your best angle",
    text: "Run up to five variants of any subject line or body per step. Sendloop tracks reply rate per variant and automatically promotes the winner once results are statistically meaningful.",
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
  { icon: Clock, title: "Sending windows", text: "Restrict sends to business hours in the prospect's timezone and skip weekends and holidays." },
  { icon: Beaker, title: "A/B/n testing", text: "Test up to five subject lines or bodies per step and auto-promote the winner by reply rate." },
  { icon: Shuffle, title: "Mailbox rotation", text: "Spread volume across connected accounts with per-account daily caps, weights and warmup-aware throttling." },
  { icon: ShieldCheck, title: "Safety guardrails", text: "Automatic stop on reply, bounce or unsubscribe plus workspace-wide suppression lists." },
];

const steps = [
  { title: "Pick your audience", text: "Select a lead list or filter by tags, industry, status and custom fields." },
  { title: "Write step one", text: "Use variables, spintax and AI icebreakers with safe fallbacks for missing data." },
  { title: "Add follow-ups", text: "Chain conditional steps with your own delays and stop rules." },
  { title: "Launch and monitor", text: "Sends run server-side while opens, clicks and replies stream into analytics." },
];

const bullets = [
  "Unlimited steps per sequence",
  "Spintax and custom variables with fallbacks",
  "Per-campaign daily send limits and ramp-up",
  "Duplicate and suppression checks before launch",
  "Pause, resume, clone and archive any campaign",
  "Timezone-aware scheduling per prospect",
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Campaigns"
        title="Multi-step cold email"
        highlight="campaigns that convert"
        description="Build sequences with delays, conditions and A/B variants, rotate across mailboxes, and launch to thousands of prospects without hurting deliverability."
        secondaryCta="Explore Campaigns"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Campaign builder"
        title="See the campaign builder"
        description="Sequence steps, variants, mailbox rotation and schedule in one screen."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="How Sendloop solves it" description="One builder for sequencing, testing and mailbox rotation.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
        <div className="mt-12">
          <StepList steps={steps} />
        </div>
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section>
        <StatStrip
          stats={[
            { value: "3.4x", label: "More replies vs. single-mailbox sending" },
            { value: "12k+", label: "Campaigns launched on Sendloop" },
            { value: "99.2%", label: "Sequences that stop cleanly on reply" },
            { value: "<10 min", label: "Median time to launch a new campaign" },
          ]}
        />
      </Section>
      <TestimonialCarousel page="campaigns" title="Teams shipping campaigns with Sendloop" />
      <Section muted>
        <FaqBlock faqs={faqs} />
      </Section>
      <CtaBlock
        title="Launch your first campaign today"
        description="Connect a provider, import a list and send your first sequence in under ten minutes."
      />
    </MarketingLayout>
  );
}
