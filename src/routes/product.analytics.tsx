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
  Calendar,
  GitCompareArrows,
  Users,
  Inbox,
  TrendingUp,
  ClipboardList,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  BulletList,
  CtaBlock,
  DocSection,
  FeatureBento,
  MarketingLayout,
  MockBars,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  Walkthrough,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "What counts as a reply for reply rate?", a: "Any inbound message on a thread MunchReach sent, matched by thread and message headers. Automated bounce and out-of-office replies are filtered out so the reply rate reflects real human responses." },
  { q: "How is a positive reply identified?", a: "Replies are classified as positive, neutral, negative or out-of-office. You can override the classification on any reply, and analytics recalculates the positive-reply rate immediately." },
  { q: "What's the difference between today, current run and lifetime numbers?", a: "Today is sends and events since midnight in your workspace timezone. Current run covers the active send window for a campaign or mailbox — its warmup ramp or the days it has been actively sending. Lifetime is every event since the campaign or mailbox was created, with no rolling window." },
  { q: "Can I compare two campaigns side by side?", a: "Yes. Pick any two or more campaigns and MunchReach lines up sent, delivered, reply rate, positive-reply rate and meetings booked in one table so you can see which is actually outperforming." },
  { q: "Does analytics track meetings booked?", a: "Yes. Meetings booked are logged from CRM stage changes on leads tied to a campaign, so you can see meetings per campaign, per step and per mailbox alongside reply counts." },
  { q: "Can I see performance per mailbox instead of per campaign?", a: "Yes. The mailbox view shows sent, delivered, bounce rate and replies per sending account, independent of which campaigns used it, so you can spot a mailbox problem even across multiple campaigns." },
  { q: "How far back can I set a custom date range?", a: "Any range since the workspace was created. Presets cover today, yesterday, last 7/30/90 days and this/last month, or you can pick exact start and end dates." },
  { q: "Is bounce rate calculated on sent or delivered volume?", a: "Bounce rate is bounces divided by sent, since a bounce means the message never reached the inbox provider. Reply and open rates use delivered volume as the denominator so a bad mailbox doesn't quietly inflate them." },
  { q: "Can I export the underlying data?", a: "Yes. Every table — campaign performance, mailbox performance, and the daily trend — exports to CSV so you can build client reports or feed the numbers into your own dashboards." },
  { q: "Does analytics update in real time?", a: "Yes. Send, delivery, bounce and reply events stream in from your mailbox providers and update the dashboard without a page refresh." },
];

export const Route = createFileRoute("/product/analytics")({
  head: () => metaFor(
    "Cold Email Analytics & Campaign Reporting | MunchReach",
    "See sent, delivered, reply and bounce data for every campaign and mailbox. Track reply rates, positive replies and meetings booked across today, the current run, and lifetime.",
    "/product/analytics",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: EyeOff, title: "No answer to \"what's working\"", text: "You can't tell which step or mailbox is actually producing replies." },
  { icon: Mailbox, title: "Mailbox problems hide in totals", text: "A blended reply rate hides the one account dragging down the average." },
  { icon: GitCompareArrows, title: "Comparing campaigns is manual", text: "Deciding which sequence to scale means exporting CSVs and lining up rows by hand." },
];

const walkthroughSteps = [
  {
    title: "Open the workspace-level overview",
    youDo: "Land on the analytics dashboard for your workspace.",
    weHandle: "MunchReach aggregates sent, delivered, opened, replied and bounced counts across every active campaign and mailbox.",
    youGet: "A single view of total volume and reply rate before drilling into any one campaign.",
    visual: (
      <MockPanel title="Analytics — Workspace overview">
        <MockBars bars={[
          { label: "Sent", value: 100, caption: "18,240" },
          { label: "Delivered", value: 96, caption: "17,510" },
          { label: "Replied", value: 9, caption: "9.4%" },
          { label: "Bounced", value: 4, caption: "3.9%" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Pick a date range",
    youDo: "Choose today, last 7/30/90 days, this month, or a custom start and end date.",
    weHandle: "Every chart and table recalculates for the exact window, and shows the change against the immediately preceding period of the same length.",
    youGet: "A trend line, not just a snapshot — so you know if reply rate is climbing or sliding.",
    visual: (
      <MockPanel title="Date range — Last 30 days vs prior 30">
        <MockRows rows={[
          { left: "Reply rate", right: "9.4%", badge: "+1.8pt" },
          { left: "Bounce rate", right: "3.9%", badge: "-0.6pt" },
          { left: "Meetings booked", right: "22", badge: "+6" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Drill into a single campaign",
    youDo: "Click into any campaign from the list.",
    weHandle: "MunchReach shows sent, delivered, opened, clicked, replied and bounced counts for that campaign broken down by step, plus positive-reply rate and meetings booked.",
    youGet: "The exact step and subject line that's earning the replies, not just an overall percentage.",
    visual: (
      <MockPanel title="Campaign — Enterprise Outbound Q3">
        <MockBars bars={[
          { label: "Step 1 — Intro", value: 40, caption: "4.1% reply" },
          { label: "Step 2 — Case study", value: 72, caption: "7.2% reply" },
          { label: "Step 3 — Breakup", value: 91, caption: "9.1% reply" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Check mailbox performance",
    youDo: "Switch to the mailbox view.",
    weHandle: "Sent, delivered, bounce rate and reply counts are shown per sending account, independent of which campaigns used it, alongside today's send count against its daily limit.",
    youGet: "An early warning when one mailbox's bounce rate is dragging down every campaign it touches.",
    visual: (
      <MockPanel title="Mailbox performance — 6 accounts">
        <MockRows rows={[
          { left: "sales@acme.com", muted: "Sent today: 38 / 40", right: "1.2% bounce" },
          { left: "hello@acme.io", muted: "Sent today: 40 / 40", right: "3.8% bounce" },
          { left: "team@acme.co", muted: "Sent today: 12 / 40", right: "9.4% bounce" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Compare today, current run and lifetime",
    youDo: "Toggle between the three windows on any campaign or mailbox.",
    weHandle: "Today totals reset at midnight, current-run totals cover the active send window, and lifetime totals accumulate since creation with no rolling window.",
    youGet: "Context for a single number — a mailbox's 5% bounce rate today reads very differently against a 1.4% lifetime average.",
    visual: (
      <MockPanel title="sales@acme.com — Bounce rate">
        <MockRows rows={[
          { left: "Today", right: "5.0%", badge: "Watch" },
          { left: "Current run", right: "2.1%" },
          { left: "Lifetime", right: "1.4%" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Compare campaigns and export",
    youDo: "Select two or more campaigns to compare, or export any table.",
    weHandle: "MunchReach lines up sent, delivered, reply rate, positive-reply rate and meetings booked side by side, and generates a CSV of the underlying rows.",
    youGet: "A ranked view of which campaign to scale, and a file ready to drop into a client report.",
    visual: (
      <MockPanel title="Compare — 2 campaigns">
        <MockRows rows={[
          { left: "Enterprise Outbound Q3", muted: "Reply rate", right: "9.4%", badge: "Leading" },
          { left: "Founder-led re-engagement", muted: "Reply rate", right: "6.1%" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: BarChart3, title: "Campaign performance", text: "Sent, delivered, opened and replied counts per campaign, broken down by step." },
  { icon: Mailbox, title: "Mailbox performance", text: "Delivery and bounce rate per sending account, independent of campaigns." },
  { icon: TrendingUp, title: "Reply rate and positive replies", text: "Reply rate against delivered volume, with replies classified by sentiment." },
  { icon: ClipboardList, title: "Meetings booked", text: "Meetings logged from CRM changes, attributed to the campaign and step." },
  { icon: Calendar, title: "Flexible date ranges", text: "Today, last 7/30/90 days, this or last month, or any custom range." },
  { icon: Timer, title: "Today vs current run vs lifetime", text: "The same metric across three windows so one spike isn't mistaken for a trend." },
  { icon: GitCompareArrows, title: "Campaign comparison", text: "Put campaigns side by side to see reply rate and meetings together." },
  { icon: LineChart, title: "Daily trend charts", text: "Sent, delivered and replied plotted by day to spot what moved the numbers." },
  { icon: PieChart, title: "Step and variant breakdown", text: "Reply rate per touch and subject line, so you know what's working." },
  { icon: Users, title: "Bounce and deliverability tracking", text: "Bounce rate flagged separately so a bad mailbox can't hide behind a good campaign." },
  { icon: Inbox, title: "Unsubscribe and complaint counts", text: "Tracked alongside replies to see the full cost of a campaign." },
  { icon: FileDown, title: "CSV export", text: "Export campaign, mailbox or trend data for reports or your own dashboards." },
];

const workflowSteps = [
  { title: "Send", text: "Campaigns go out across your connected mailboxes on schedule." },
  { title: "Track", text: "Send, delivery, open and reply events stream in from each provider." },
  { title: "Classify", text: "Replies are sorted by sentiment automatically." },
  { title: "Attribute", text: "Meetings booked are linked back to the campaign and step that produced them." },
  { title: "Compare", text: "Filter by date range and view today, current-run or lifetime totals." },
  { title: "Diagnose", text: "Check mailbox performance to catch a bounce problem before it spreads." },
  { title: "Rank", text: "Compare campaigns to see which one to scale and which to pause." },
  { title: "Report", text: "Export any table to CSV to share with your team or a client." },
];

const useCases = [
  { icon: Target, audience: "Founders sending their own outbound", scenario: "You want to know if this week's campaign is actually booking meetings.", outcome: "One dashboard with reply rate and meetings booked, updated live." },
  { icon: Users, audience: "Sales teams running multiple sequences", scenario: "Different reps run different campaigns and you need to know which works.", outcome: "Campaign comparison ranks every sequence by reply rate." },
  { icon: Mailbox, audience: "Teams managing several mailboxes", scenario: "You need to catch a mailbox before its bounce rate drags down campaigns.", outcome: "Per-mailbox performance with today, current-run and lifetime rates." },
  { icon: GitCompareArrows, audience: "Teams testing new subject lines or steps", scenario: "You want proof one version outperforms another before rolling it out.", outcome: "Step-by-step breakdown shows exactly which message is winning." },
  { icon: FileDown, audience: "Agencies reporting to clients", scenario: "Every client wants a clear, current summary of their campaigns.", outcome: "Exportable tables ready to drop into a report." },
  { icon: Calendar, audience: "Managers reviewing weekly progress", scenario: "You need to see if outbound is trending up or down over time.", outcome: "Custom date ranges with trend comparison against the prior period." },
];

const docGroups = [
  {
    title: "Campaign performance",
    items: [
      "Sent, delivered, opened, clicked, replied and bounced counts per campaign",
      "Step and subject-line level reply-rate breakdown",
      "Positive, neutral, negative and out-of-office reply classification",
      "Meetings booked attributed to the campaign that produced them",
    ],
  },
  {
    title: "Mailbox performance",
    items: [
      "Sent, delivered and bounce rate per sending account",
      "Sent-today count against each mailbox's daily limit",
      "Bounce and reply counts independent of which campaigns used the mailbox",
      "Today, current-run and lifetime windows on every mailbox metric",
    ],
  },
  {
    title: "Reporting and comparison",
    items: [
      "Custom date ranges plus common presets like last 7, 30 or 90 days",
      "Trend comparison against the immediately preceding period",
      "Side-by-side comparison across two or more campaigns",
      "CSV export of campaign, mailbox and daily trend data",
    ],
  },
];

const detailBullets = [
  "Reply rate calculated against delivered volume, not sent volume",
  "Bounce rate calculated against sent volume, since a bounce never reaches the inbox",
  "Automated bounce and out-of-office messages excluded from reply counts",
  "Replies reclassified manually always recalculate downstream rates immediately",
  "Today totals reset at midnight in your workspace timezone",
  "Current-run totals track a campaign's or mailbox's active send window",
  "Lifetime totals accumulate since creation with no rolling window or downgraded resolution",
  "Daily trend charts for sent, delivered, replied and bounced volume",
  "Mailbox view is independent of campaigns, so a shared mailbox's health is visible everywhere it's used",
  "Every table exports to CSV for client reporting or external dashboards",
];

const beforeAfter = {
  before: [
    "A blended reply rate hides which step and mailbox are doing the work",
    "A bouncing mailbox isn't noticed until several campaigns are already hurt",
    "Comparing two campaigns means two exported CSVs lined up by hand",
    "Client updates are built manually from screenshots each week",
    "A single day's numbers get mistaken for a lasting trend",
  ],
  after: [
    "Reply rate broken down by campaign, step and mailbox in one dashboard",
    "Mailbox performance flags a rising bounce rate on its own view",
    "Campaign comparison ranks sequences side by side automatically",
    "Any table exports to CSV in a click",
    "Today, current-run and lifetime windows give every number context",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Analytics"
        title="See exactly what every campaign and mailbox is"
        highlight="producing"
        description="Sent, delivered, replied and bounced data for every campaign and mailbox, with reply rates, positive replies and meetings booked broken down by today, the current run and lifetime."
        benefits={["Campaign and mailbox performance in one place", "Reply rate, positive replies and meetings booked", "Compare campaigns and date ranges side by side"]}
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="Analytics dashboard"
        title="Every number tied to a campaign, a step or a mailbox"
        description="Not a vanity open-rate widget — a full breakdown of what's driving replies and meetings."
      >
        <div className="p-4 sm:p-6">
          <MockPanel title="Campaign — Enterprise Outbound Q3">
            <MockBars bars={[
              { label: "Sent", value: 100, caption: "12,900" },
              { label: "Delivered", value: 97, caption: "12,480" },
              { label: "Replied", value: 8, caption: "8.2%" },
              { label: "Positive replies", value: 5, caption: "4.9%" },
              { label: "Meetings booked", value: 3, caption: "3.1%" },
            ]} />
          </MockPanel>
        </div>
      </BigPreview>
      <Section title="Why outbound reporting falls short">
        <PainPoints items={pains} />
      </Section>
      <Section id="how-it-works" title="How analytics works" description="From send event to a number you can act on.">
        <Walkthrough steps={walkthroughSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="The end-to-end workflow" muted>
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who it's for" description="Built for the way outbound teams actually review their numbers.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep reporting capabilities" description="What's covered across campaigns, mailboxes and comparisons.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={detailBullets} />
      </Section>
      <Section title="Before and after" description="What changes the week you start using analytics.">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="analytics" title="Teams that report on outcomes, not vanity metrics" />
      <Section muted>
        <PageFaqs page="analytics" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Stop guessing what your outbound is producing"
        description="See sent, delivered, replies and meetings booked for every campaign and mailbox — today, this run, and over its lifetime."
      />
    </MarketingLayout>
  );
}
