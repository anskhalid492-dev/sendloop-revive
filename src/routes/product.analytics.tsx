import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  GitCompareArrows,
  Search,
  Send,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  BigPreview,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  StepList,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  AnalyticsDashboardMock,
  CampaignPerformanceTableMock,
  CampaignVsMailboxMock,
  CompareCampaignsMock,
  DeliveryHealthMock,
  FunnelMock,
  InsightCards,
  ReplyAnalyticsMock,
  TodayVsLifetimeMock,
  TrendMock,
} from "@/components/site/AnalyticsProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What metrics does MunchReach Analytics track?",
    a: "Emails sent, delivered, opens, clicks, replies and reply rate, positive replies, bounces and bounce rate, failed sends, unsubscribes, and meetings booked — per campaign, per mailbox and across the workspace.",
  },
  {
    q: "Can I see campaign performance over time?",
    a: "Yes. The trend view plots daily activity over the last 7, 30 or 90 days, or a custom range. When a workspace has not sent enough yet, the chart says so rather than drawing an empty line.",
  },
  {
    q: "Can I compare campaigns?",
    a: "Yes. Pick campaigns and MunchReach lines up sent, reply rate, positive replies, meetings and bounce rate side by side so you can see which one is actually performing better.",
  },
  {
    q: "Does Analytics separate today's activity from lifetime results?",
    a: "Yes. Today covers activity since midnight in the campaign's own timezone, and lifetime covers every recorded event since the campaign was created. The two are shown separately so a good day never looks like a good campaign.",
  },
  {
    q: "Can I track replies and meetings?",
    a: "Yes. Replies are matched back to the send that produced them and classified so positive responses can be counted separately. Meetings booked come from CRM stage changes on leads tied to a campaign.",
  },
  {
    q: "Does Analytics show bounce and delivery performance?",
    a: "Yes. Delivery rate, bounce rate and failed sends are reported separately — a bounce is a rejection by the receiving provider, a failed send is a message that never left. Mailbox health and warmup are reported apart from campaign results.",
  },
];

export const Route = createFileRoute("/product/analytics")({
  head: () =>
    metaFor(
      "MunchReach Analytics — Know What Your Outreach Is Producing",
      "Track sends, replies, positive replies, bounces and meetings per campaign. Compare campaigns, follow the outbound funnel, and separate today's activity from lifetime results.",
      "/product/analytics",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: BarChart3,
    title: "Volume is not performance",
    text: "Five thousand sends tells you nothing about which campaign actually earned replies.",
  },
  {
    icon: Target,
    title: "You can't see what to fix",
    text: "Without per-campaign numbers, an underperforming sequence keeps running unnoticed.",
  },
  {
    icon: TrendingUp,
    title: "No sense of direction",
    text: "Is this month better than last? Is bounce rate creeping up? Guessing is not a strategy.",
  },
];

const solutions = [
  {
    eyebrow: "A. Reply analytics",
    title: "Measure conversations, not just volume",
    text: "A large sending volume is only useful if it creates conversations and opportunities. Replies, reply rate, positive replies and meetings are tracked together.",
    bullets: [
      "Replies matched back to the send that produced them",
      "Positive replies counted separately from all responses",
      "Meetings logged from CRM stage changes on the lead",
    ],
    visual: <ReplyAnalyticsMock />,
  },
  {
    eyebrow: "B. Trends",
    title: "See how your outreach changes over time",
    text: "Sends, reply rate, bounce rate and meetings on one chart, over 7, 30 or 90 days.",
    bullets: [
      "Preset ranges plus custom start and end dates",
      "Filter the trend down to a single campaign",
      "Clear empty state when there is not enough activity yet",
    ],
    visual: <TrendMock />,
  },
  {
    eyebrow: "C. Comparison",
    title: "Compare campaigns side by side",
    text: "Put two campaigns next to each other on the metrics that decide whether a sequence is worth keeping.",
    bullets: [
      "Sent, reply rate, positive replies, meetings and bounce rate",
      "Same date range applied to both sides",
      "Placeholder values in the interface, your data in the product",
    ],
    visual: <CompareCampaignsMock />,
  },
];

const why = [
  {
    icon: BarChart3,
    title: "See the full picture",
    text: "Sending, replies, bounces and meetings understood together, not in isolation.",
  },
  {
    icon: GitCompareArrows,
    title: "Find what works",
    text: "Compare campaigns and identify the outreach that is actually performing.",
  },
  {
    icon: Target,
    title: "Make better decisions",
    text: "Use real campaign data to shape the next campaign you launch.",
  },
];

const audiences = [
  {
    icon: Users,
    audience: "Sales teams",
    scenario: "Several sequences running at once across the team.",
    outcome: "See which campaigns generate conversations and meetings.",
  },
  {
    icon: Building2,
    audience: "Agencies",
    scenario: "Client outreach split across separate workspaces.",
    outcome: "Understand campaign performance per client.",
  },
  {
    icon: Send,
    audience: "Founders",
    scenario: "Outbound is one of several things you are running.",
    outcome: "Know whether it is producing real sales activity.",
  },
];

const steps = [
  { title: "Launch your campaigns", text: "Sequences start sending on schedule." },
  { title: "Activity is recorded", text: "Sends, deliveries, bounces and replies log automatically." },
  { title: "Review performance", text: "Check the dashboard, trends and comparisons." },
  { title: "Improve what matters", text: "Fix or retire the campaigns that underperform." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach Analytics"
        title="Know What Your Outreach Is"
        highlight="Actually Producing."
        description="Track sending activity, replies, bounce rates, meetings and campaign performance from one clear analytics workspace."
        benefits={["Per-campaign performance", "Replies and meetings tracked", "Today separated from lifetime"]}
        primaryCta="Explore Analytics"
        secondaryCta="Start a Campaign"
        secondaryHref="#product"
      />

      <BigPreview
        id="product"
        eyebrow="Inside Analytics"
        title="Your outbound performance at a glance"
        description="Emails sent, reply rate, bounce rate, positive replies and meetings booked — filtered by date range, campaign and workspace."
      >
        <AnalyticsDashboardMock />
      </BigPreview>

      <Section
        muted
        title="Sending more emails doesn't tell you what is working"
        description="The numbers that matter are per campaign, not per month."
      >
        <PainPoints items={problems} />
      </Section>

      <Section
        title="See which campaigns are working"
        description="Sent, delivered, replies, reply rate, positive replies, meetings and bounce rate for every campaign, sortable and filterable."
      >
        <CampaignPerformanceTableMock />
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          {["Sort by reply rate", "Filter by status", "Filter by date range", "Search campaigns"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1">
              <Search className="size-3" />
              {f}
            </span>
          ))}
        </div>
      </Section>

      <Section
        muted
        title="Follow the journey from lead to meeting"
        description="Each stage narrows the last — and shows you where the drop-off actually happens."
      >
        <FunnelMock />
      </Section>

      <Section title="Measure conversations, not just volume">
        <SolutionSplit rows={solutions} />
      </Section>

      <Section
        muted
        title="Spot sending problems early"
        description="Delivery, bounces and failed sends are three different things — and mixing them hides real problems."
      >
        <DeliveryHealthMock />
      </Section>

      <Section
        title="Separate today's activity from lifetime results"
        description="Today respects the campaign's timezone. Lifetime covers everything since the campaign was created."
      >
        <TodayVsLifetimeMock />
      </Section>

      <Section
        muted
        title="Turn numbers into better decisions"
        description="Interface examples. Real signals are generated only from data your workspace has produced."
      >
        <InsightCards />
      </Section>

      <Section
        title="Know which numbers belong to your campaign"
        description="Campaign performance and mailbox health are two datasets. MunchReach never blends them into one number."
      >
        <CampaignVsMailboxMock />
      </Section>

      <Section muted title="Who it's for">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section title="How it works">
        <StepList steps={steps} />
      </Section>

      <Section muted title="Why MunchReach Analytics">
        <FeatureGrid items={why} />
      </Section>

      <TestimonialCarousel page="analytics" title="Teams that report on outcomes, not vanity metrics" />

      <Section muted>
        <PageFaqs page="analytics" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Turn your outreach data into better campaigns."
        description="See what is working, understand what is not, and make better decisions with real campaign data."
        cta="Explore Analytics"
      />
    </MarketingLayout>
  );
}
