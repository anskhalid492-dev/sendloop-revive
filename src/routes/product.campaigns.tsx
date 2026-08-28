import { createFileRoute } from "@tanstack/react-router";
import { Layers, Repeat2, BarChart3 } from "lucide-react";

import {
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  Section,
  UseCaseGrid,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  AfterLaunchStrip,
  AiPersonalizationMock,
  AnalyticsMock,
  CampaignBuilderMock,
  Callouts,
  DayTimeline,
  FailureRouting,
  InboxMock,
  LaunchProcess,
  MailboxMock,
  ScheduleMock,
  SequenceMock,
} from "@/components/site/CampaignsProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "How does campaign scheduling work?",
    a: "You set a sending window, a timezone and the days of the week a campaign may send. Sending only happens inside that window, and the next run is calculated from the schedule itself — not from when the previous run finished.",
  },
  {
    q: "What happens when my daily sending limit is reached?",
    a: "The campaign stops sending for the day and the remaining messages stay queued. It is marked as having reached today's quota and waits for the next eligible sending window — it is not marked completed just because the day's quota is full.",
  },
  {
    q: "Can I use multiple sending accounts?",
    a: "Yes. Assign as many connected mailboxes as you want to a campaign. Sending is distributed across the accounts that are available, respecting each mailbox's own capacity and safety state; if one mailbox is full or paused, the others keep sending.",
  },
  {
    q: "What happens when an email fails?",
    a: "Temporary failures such as provider errors, rate limits or capacity issues stay eligible and are retried on the next run. Permanent failures are not retried, a permanently undeliverable address is suppressed, and failed attempts do not consume the successful daily quota.",
  },
  {
    q: "How does AI personalization work?",
    a: "You turn it on for a step, pick a tone, write your instructions and insert the {{ai_personalization}} variable in the email body. A personalized line is generated per lead from that lead's record and is resolved before the email is sent; leads with missing data fall back to a safe line.",
  },
  {
    q: "Where do campaign replies go?",
    a: "Replies are threaded into the Unified Inbox with the prospect, campaign, sending account and lead record attached, so you can respond from one place instead of checking each mailbox. A reply also stops further follow-up steps for that lead.",
  },
];

export const Route = createFileRoute("/product/campaigns")({
  head: () =>
    metaFor(
      "Cold Email Campaigns — Sequences, Sending & Follow-ups | MunchReach",
      "Build a sequence, add leads, choose sending accounts and set a schedule. MunchReach runs the queue across days, handles follow-ups, retries and reply tracking.",
      "/product/campaigns",
      faqs,
    ),
  component: Page,
});

const builderCallouts = [
  { n: 1, text: "Campaign setup — name, workspace and status in one header." },
  { n: 2, text: "Lead list attached to the campaign, deduplicated and suppression-checked." },
  { n: 3, text: "Email sequence with the initial email and every follow-up step." },
  { n: 4, text: "Sending accounts assigned to this campaign." },
  { n: 5, text: "Schedule: sending window, timezone and sending days." },
  { n: 6, text: "Daily sending limit, with today's progress against it." },
  { n: 7, text: "Live campaign status and tracking options." },
];

const launchSteps = [
  { n: "01", title: "Add Leads", text: "Import a list or pull existing leads into the campaign." },
  { n: "02", title: "Build Your Sequence", text: "Write the first email and chain the follow-ups." },
  { n: "03", title: "Choose Sending Accounts", text: "Assign the mailboxes this campaign may send from." },
  { n: "04", title: "Set Schedule & Limits", text: "Pick the window, timezone, days and daily limit." },
  { n: "05", title: "Launch Campaign", text: "The campaign starts on the next eligible window." },
];

const whyCards = [
  {
    icon: Layers,
    title: "Build Once",
    text: "Create the sequence, personalization, schedule and sending rules in one campaign.",
  },
  {
    icon: Repeat2,
    title: "Keep Sending",
    text: "Your campaign continues across eligible sending windows instead of stopping when one day's quota is reached.",
  },
  {
    icon: BarChart3,
    title: "Know the Result",
    text: "Track sends, replies, reply rate, bounces, positive replies and meetings.",
  },
];

const audiences = [
  {
    audience: "Sales Teams",
    scenario: "Structured outbound across shared lead lists and several reps.",
    outcome: "Run campaigns without manually managing every sending step.",
  },
  {
    audience: "Agencies",
    scenario: "Separate campaigns, mailboxes and reporting per client.",
    outcome: "Manage multiple campaigns and sending accounts across client workspaces.",
  },
  {
    audience: "Founders & Small Teams",
    scenario: "Selling early with no dedicated outbound operator.",
    outcome: "Build and run outbound without a complicated sending setup.",
  },
];

const howItWorks = [
  { title: "Add your leads", text: "Import a CSV or select leads already in your workspace." },
  { title: "Write your sequence", text: "One initial email plus the follow-ups and their delays." },
  { title: "Configure sending", text: "Choose mailboxes, the sending window and the daily limit." },
  { title: "Launch", text: "MunchReach runs the queue and schedules the follow-ups." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach Campaigns"
        title="Build Cold Email Campaigns"
        highlight="That Keep Moving."
        description="Create your sequence, add your leads, choose your sending accounts, set your schedule, and let MunchReach manage the sending and follow-ups."
        benefits={["Sequences", "AI personalization", "Smart scheduling", "Multi-mailbox sending"]}
        primaryCta="Start a Campaign"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      >
        <CampaignBuilderMock />
      </PageHero>

      <Section
        id="product"
        title="Everything Starts in One Campaign Builder"
        description="Build the entire outreach workflow before you send a single email."
      >
        <div className="space-y-6">
          <Callouts items={builderCallouts} />
        </div>
      </Section>

      <Section
        muted
        title="Build the Conversation, Not Just the First Email"
        description="Write once, then let MunchReach deliver each step according to your campaign rules."
      >
        <SequenceMock />
      </Section>

      <Section
        title="Make Every Email Feel Personal"
        description="Generate a personalized line for each lead using the information available in your lead record."
      >
        <AiPersonalizationMock />
      </Section>

      <Section
        muted
        title="Use Your Sending Accounts Without Managing Them One by One"
        description="MunchReach distributes campaign sending across the sending accounts available to the campaign while respecting each mailbox's sending capacity and safety state."
      >
        <MailboxMock />
      </Section>

      <Section
        title="Set the Schedule. MunchReach Handles the Queue."
        description="If the campaign reaches its daily sending capacity, the remaining messages stay queued for the next eligible sending window — the campaign does not become completed just because today's quota is full."
      >
        <ScheduleMock />
      </Section>

      <Section
        muted
        title="Your Campaign Doesn't Stop After One Day"
        description="What the same campaign does across its first three sending days."
      >
        <DayTimeline />
      </Section>

      <Section
        title="When Something Fails, Don't Lose the Lead"
        description="Every send outcome is routed to the behavior that fits it."
      >
        <FailureRouting />
      </Section>

      <Section
        muted
        title="See What Your Campaign Is Actually Producing"
        description="Today's run and lifetime campaign results are reported separately. Mailbox warmup activity is never mixed into campaign analytics."
      >
        <AnalyticsMock />
      </Section>

      <Section
        title="Replies Become Real Conversations"
        description="When prospects reply, the conversation can be managed from the Unified Inbox instead of forcing users to search through multiple mailboxes."
      >
        <InboxMock />
      </Section>

      <Section muted title="From Campaign Setup to Conversation">
        <LaunchProcess steps={launchSteps} />
        <AfterLaunchStrip
          items={[
            "Manages the queue",
            "Sends emails",
            "Schedules follow-ups",
            "Records results",
            "Routes replies",
          ]}
        />
      </Section>

      <Section title="Why MunchReach Campaigns">
        <FeatureGrid items={whyCards} />
      </Section>

      <Section muted title="Who It's For">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section id="how-it-works" title="Start a Campaign in Four Steps">
        <WorkflowStrip steps={howItWorks} />
      </Section>

      <TestimonialCarousel page="campaigns" title="Teams shipping campaigns with MunchReach" />

      <Section muted>
        <PageFaqs page="campaigns" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Build Your First Campaign."
        description="Create your sequence, choose your sending setup, and let MunchReach handle the daily execution."
        cta="Start a Campaign"
        secondaryCta="Explore MunchReach"
        secondaryHref="/why-munchreach"
      />
    </MarketingLayout>
  );
}
