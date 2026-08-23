import { createFileRoute } from "@tanstack/react-router";
import {
  Flame,
  TrendingUp,
  MailCheck,
  ShieldCheck,
  Gauge,
  AlertTriangle,
  Inbox,
  ThermometerSnowflake,
  ShieldAlert,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  FeatureGrid,
  MarketingLayout,
  MockBars,
  MockPanel,
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
  { q: "How long does warmup take?", a: "Two to four weeks for a brand new domain. Established domains often need only a week." },
  { q: "Can I send while warming up?", a: "Yes, at reduced volume. MunchReach enforces the safe daily ceiling for you." },
  { q: "Does warmup guarantee inbox placement?", a: "Nothing can guarantee placement, but warmup plus authentication and good copy dramatically improves it." },
  { q: "Do I need a separate domain?", a: "Most teams use a dedicated sending domain so campaign activity cannot affect their main domain." },
  { q: "How is warmup traffic different from real campaign traffic?", a: "Warmup emails are tracked separately and never count against your campaign volume or land in a real prospect's inbox." },
  { q: "What triggers a risk alert?", a: "A spike in bounce rate, a drop in spam placement, or an authentication failure will all trigger an immediate alert so you can pause before damage compounds." },
];

export const Route = createFileRoute("/product/warmup")({
  head: () =>
    metaFor(
      "Email Warmup & Deliverability Protection",
      "Warm up new mailboxes gradually with real conversations, spam-folder rescue and live deliverability monitoring.",
      "/product/warmup",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: ThermometerSnowflake, title: "Cold mailboxes get flagged fast", text: "A brand new domain sending 200 emails on day one looks exactly like a spammer to every major provider." },
  { icon: Inbox, title: "Landing in spam, silently", text: "Without visibility into placement, you can run a whole campaign never knowing it never reached the inbox tab." },
  { icon: ShieldAlert, title: "One bad sequence, months of damage", text: "A reputation hit can take weeks to recover from — long after the campaign that caused it has ended." },
];

const solutionRows = [
  {
    eyebrow: "Gradual ramp-up",
    title: "Reputation built the way providers expect it",
    text: "Warmup starts at a handful of emails per day and increases automatically as engagement signals improve, mimicking the sending pattern of a real, trusted mailbox.",
    bullets: [
      "Automatic daily volume increases",
      "Weekend and holiday behaviour that mimics humans",
      "Ramp speed tuned to domain age",
    ],
    visual: (
      <MockPanel title="Warmup ramp — sam@munchreach.dev">
        <MockBars
          bars={[
            { label: "Week 1", value: 15, caption: "8 emails/day" },
            { label: "Week 2", value: 35, caption: "22 emails/day" },
            { label: "Week 3", value: 62, caption: "45 emails/day" },
            { label: "Week 4", value: 90, caption: "65 emails/day · target reached" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Spam-folder rescue",
    title: "Deliverability tracked and corrected in real time",
    text: "A live network of mailboxes opens, replies to and marks your warmup emails important. Anything that lands in spam is automatically moved to the inbox and flagged not-spam.",
    visual: (
      <MockPanel title="Placement — last 7 days">
        <MockBars
          bars={[
            { label: "Inbox placement", value: 94, caption: "94%" },
            { label: "Spam placement", value: 4, caption: "4% (auto-rescued)" },
            { label: "Reply engagement rate", value: 71, caption: "71%" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Health score & alerts",
    title: "Know a problem exists before it costs you replies",
    text: "Every mailbox gets a single health score combining deliverability, bounce rate and spam placement, plus instant alerts when something drifts out of range so you can pause before it spreads.",
    visual: (
      <MockPanel title="Mailbox health overview">
        <MockBars
          bars={[
            { label: "sam@munchreach.dev", value: 96, caption: "96 · Healthy" },
            { label: "hello@munchreachmail.com", value: 58, caption: "58 · Ramping" },
            { label: "outreach@getmunchreach.io", value: 34, caption: "34 · Bounce spike detected" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Flame, title: "Gradual ramp-up", text: "Start at a handful of emails per day and increase automatically as reputation improves." },
  { icon: TrendingUp, title: "Real conversations", text: "Warmup emails are opened, replied to and marked important by a network of live mailboxes." },
  { icon: MailCheck, title: "Spam-folder rescue", text: "Messages landing in spam are moved to the inbox and marked not-spam." },
  { icon: ShieldCheck, title: "Authentication checks", text: "SPF, DKIM, DMARC and custom tracking domain validation before you launch." },
  { icon: Gauge, title: "Health score", text: "A per-mailbox score combining deliverability, bounce rate, spam placement and volume." },
  { icon: AlertTriangle, title: "Risk alerts", text: "Get notified when bounce rates spike or placement drops so you can pause before damage." },
];

const steps = [
  { title: "Connect the mailbox", text: "Add SMTP/IMAP or an API provider and verify authentication records." },
  { title: "Enable warmup", text: "Choose a target daily volume and a ramp speed." },
  { title: "Build reputation", text: "Warmup runs quietly in the background every day, including weekends." },
  { title: "Start sending", text: "Campaigns respect the warmed limit so you never send more than the mailbox can handle." },
];

const bullets = [
  "Automatic DNS record checks with fix instructions",
  "Separate warmup and campaign volume tracking",
  "Weekend and holiday behaviour that mimics humans",
  "Per-domain and per-mailbox reporting",
  "Pause warmup at any time without losing progress",
  "Recommended limits based on domain age",
];

const beforeAfter = {
  before: [
  "A brand-new domain sends 200 cold emails on day one",
  "Nobody notices a blacklist entry until reply rate collapses",
  "DNS records are half-configured and never re-checked"
],
  after: [
  "Automated ramp-up with human-like reply patterns",
  "Continuous blacklist, SPF, DKIM and DMARC monitoring",
  "Alerts before deliverability damage becomes permanent"
],
};

const useCases = [
  {
    "audience": "New domains",
    "scenario": "You just bought sending domains and cannot risk burning them.",
    "outcome": "A warmed, inbox-placing mailbox in weeks, not months."
  },
  {
    "audience": "Recovering senders",
    "scenario": "Reputation dropped after an aggressive campaign.",
    "outcome": "Guided ramp-down and recovery with health scoring."
  },
  {
    "audience": "High-volume teams",
    "scenario": "Dozens of mailboxes to keep healthy at once.",
    "outcome": "Fleet-wide health in a single dashboard."
  }
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Warmup"
        title="Email warmup that protects"
        highlight="your sender reputation"
        description="New domains and cold mailboxes need a reputation before they can send at volume. Warmup builds it gradually with real conversations and spam-folder rescue."
        secondaryCta="See How Warmup Works"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Warmup dashboard"
        title="Your mailbox health at a glance"
        description="Ramp progress, placement and per-mailbox health scores, updated daily."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="Why new domains land in spam">
        <PainPoints items={painPoints} />
      </Section>
      <Section title="How MunchReach solves it" description="Deliverability, monitored and defended automatically.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureGrid items={features} />
        <div className="mt-12">
          <WorkflowStrip steps={steps} />
        </div>
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section>
        <StatStrip
          stats={[
            { value: "94%", label: "Average inbox placement after warmup" },
            { value: "3–4 wks", label: "Typical ramp for a brand new domain" },
            { value: "24/7", label: "Reputation monitoring per mailbox" },
            { value: "0", label: "Campaigns sent over a mailbox's safe limit" },
          ]}
        />
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <TestimonialCarousel page="warmup" title="Deliverability, in their words" />
      <Section muted>
        <PageFaqs page="warmup" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Warm your mailboxes before you scale"
        description="Protect your domain reputation and land in the inbox from day one."
      />
    </MarketingLayout>
  );
}
