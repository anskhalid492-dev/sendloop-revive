import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  LineChart,
  PieChart,
  FileDown,
  Target,
  Timer,
  EyeOff,
  Mailbox,
  Puzzle,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  FeatureGrid,
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
  metaFor,
  BigPreview,
  WorkflowStrip,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Is open tracking reliable?", a: "Open tracking is directional because of privacy proxies like Apple Mail Privacy Protection. MunchReach filters known bots and highlights reply rate as the primary metric." },
  { q: "Can I use my own tracking domain?", a: "Yes, and we recommend it. Add a CNAME record and MunchReach handles opens and clicks under your own domain for better deliverability." },
  { q: "How long is data kept?", a: "Event-level history is retained for the lifetime of the workspace — no rolling window, no downgraded resolution." },
  { q: "Can I export raw events?", a: "Yes, every metric — sends, opens, clicks, replies, bounces — can be exported as CSV or pulled via the API." },
  { q: "Can I compare two variants directly?", a: "Yes, the variant view sits subject-line by subject-line with statistical significance flagged automatically." },
  { q: "Can I schedule reports for clients?", a: "Yes, weekly or monthly PDF and CSV summaries can be emailed automatically, or shared via a read-only link." },
];

export const Route = createFileRoute("/product/analytics")({
  head: () => metaFor(
    "Cold Email Analytics & Campaign Tracking | MunchReach",
    "Track campaign performance, email activity, replies, and engagement to understand what's working across your outreach campaigns.",
    "/product/analytics",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: EyeOff, title: "Vanity metrics, no answers", text: "You know your open rate, but not which step, subject line or mailbox is actually producing meetings." },
  { icon: Mailbox, title: "Deliverability issues found too late", text: "A mailbox's bounce rate creeps up for weeks before anyone notices the whole domain is at risk." },
  { icon: Puzzle, title: "Reporting is a manual export job", text: "Every client report means stitching numbers from three tools into a slide deck by hand." },
];

const solutionRows = [
  {
    eyebrow: "Funnel",
    title: "See the full funnel for every campaign, live",
    text: "From delivered to opened, replied, meeting booked and closed — updated in real time as events stream in, no manual refresh required.",
    bullets: ["Delivered, open, click, reply and bounce in one view", "Filter by list, tag, date range or step", "Compare against the previous period instantly"],
    visual: (
      <MockPanel title="Campaign — Enterprise Outbound Q3">
        <MockBars bars={[
          { label: "Delivered", value: 100, caption: "12,480" },
          { label: "Opened", value: 61, caption: "61%" },
          { label: "Replied", value: 8, caption: "8.2%" },
          { label: "Meeting booked", value: 3, caption: "3.1%" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Deliverability",
    title: "Catch a sick mailbox before it hurts your domain",
    text: "Per-mailbox bounce rate, spam complaints and daily volume trends flag problems days before they'd show up as a deliverability crisis.",
    bullets: ["Automatic pause on rising bounce rate", "Health score per sending account", "Trend view across 30, 60, 90 days"],
    visual: (
      <MockPanel title="Mailbox health — 6 accounts">
        <MockBars bars={[
          { label: "sales@acme.com", value: 94, caption: "Healthy" },
          { label: "hello@acme.io", value: 78, caption: "Watch" },
          { label: "team@acme.co", value: 41, caption: "At risk" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Attribution",
    title: "Tie revenue back to the campaign that earned it",
    text: "Every meeting and closed deal links back to the campaign, step, variant and mailbox that produced it — so budget follows what actually works.",
    visual: (
      <MockPanel title="Attribution — This quarter">
        <MockRows rows={[
          { left: "Q3 Outbound — Step 2 variant B", right: "$58,200", badge: "Top" },
          { left: "Re-engagement sequence", right: "$21,400" },
          { left: "Founder-led cold email", right: "$14,900" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: BarChart3, title: "Campaign dashboards", text: "Funnel view from delivered to replied to meeting booked, per campaign." },
  { icon: LineChart, title: "Step and variant breakdown", text: "See which touch and which subject line actually earns the reply." },
  { icon: PieChart, title: "Mailbox health", text: "Bounce rate, spam complaints and deliverability trends per sending account." },
  { icon: FileDown, title: "Team performance", text: "Reply handling time, meetings booked and pipeline created per teammate." },
  { icon: Target, title: "Scheduled reports", text: "Weekly PDF or CSV summaries emailed to you or your client." },
  { icon: Timer, title: "Attribution", text: "Tie meetings and closed deals back to the campaign, step and mailbox that produced them." },
];

const steps = [
  { title: "Send campaigns", text: "Tracking is enabled per campaign with your own tracking domain." },
  { title: "Watch live metrics", text: "Events stream in as they happen with no manual refresh." },
  { title: "Compare variants", text: "Filter by step, variant, list, tag or date range." },
  { title: "Share the results", text: "Export or schedule a report your client can read without logging in." },
];

const stats = [
  { value: "61%", label: "Median open rate on warmed mailboxes" },
  { value: "<2 min", label: "Event-to-dashboard latency" },
  { value: "100%", label: "Of events available for CSV export" },
  { value: "30/60/90d", label: "Trend windows on every mailbox" },
];

const beforeAfter = {
  before: [
  "Open rate is the only number anyone can quote",
  "Deliverability problems surface weeks after they start",
  "Client reports are stitched together by hand every month"
],
  after: [
  "Funnel from delivered to reply to meeting, per step and variant",
  "Bounce and spam alerts the day a mailbox drifts",
  "Scheduled CSV and PDF reports, or a read-only share link"
],
};

const useCases = [
  {
    "audience": "Growth leads",
    "scenario": "You need to know which sequence actually produces meetings.",
    "outcome": "Reply-rate attribution down to step and variant."
  },
  {
    "audience": "Deliverability owners",
    "scenario": "You manage reputation across many mailboxes and domains.",
    "outcome": "Per-mailbox bounce and complaint trends with alerts."
  },
  {
    "audience": "Agencies",
    "scenario": "Every client wants a monthly performance report.",
    "outcome": "Automated client-safe reporting, zero spreadsheets."
  }
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow={"Analytics"}
        title={"Know exactly which campaigns"}
        highlight={"produce replies"}
        description={"Opens, clicks, replies, bounces, meetings and revenue — broken down by campaign, step, variant, mailbox and teammate, with exports for client reporting."}
        secondaryCta="View Analytics"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Analytics dashboard"
        title="See what is actually working"
        description="Campaign, sequence, mailbox and reply analytics side by side."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="Why outbound reporting fails">
        <PainPoints items={pains} />
      </Section>
      <Section title="How MunchReach solves it" description="Dashboards built around decisions, not vanity numbers.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureGrid items={features} />
      </Section>
      <Section title="How it works" muted>
        <WorkflowStrip steps={steps} />
      </Section>
      <Section>
        <StatStrip stats={stats} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <TestimonialCarousel page="analytics" title="Reporting teams trust" />
      <Section title="Details that matter">
        <BulletList items={["Custom tracking domains for open and click tracking", "Bot-click filtering for more accurate numbers", "Date range comparison against the previous period", "Per-list and per-segment reply rates", "CSV export of every underlying event", "Client-safe read-only report links"]} />
      </Section>
      <Section muted>
        <PageFaqs page="analytics" defaults={faqs} />
      </Section>
      <CtaBlock title={"Report on outcomes, not vanity metrics"} description={"See which sequence, step and mailbox actually books meetings."} />
    </MarketingLayout>
  );
}
