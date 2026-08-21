import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Gauge,
  Layers,
  Mailbox,
  RefreshCcw,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Unplug,
} from "lucide-react";

import {
  BigPreview,
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
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Do I need to connect my own SMTP or provider?", a: "No. MunchReach is a managed platform — we run the sending infrastructure and assign healthy mailboxes to your workspace." },
  { q: "How many email accounts do I get?", a: "Your plan sets the number of managed sending accounts. You can request more at any time from your workspace." },
  { q: "Can I pause a single account?", a: "Yes. Every account has an on/off switch, so you can rest a mailbox without pausing the whole campaign." },
  { q: "How is sending spread across accounts?", a: "Campaigns rotate across your assigned accounts using round robin, random or least-used strategies with per-inbox daily caps." },
  { q: "What happens if an account starts failing?", a: "Health scores drop, alerts fire, and the rotation automatically routes volume to healthier mailboxes." },
  { q: "Where do replies go?", a: "Every reply lands in your Unified Inbox, threaded with the original campaign message." },
];

export const Route = createFileRoute("/product/email-accounts")({
  head: () =>
    metaFor(
      "Managed Email Accounts & Sending Health — MunchReach",
      "MunchReach runs your sending infrastructure. Monitor managed email accounts, daily limits, rotation and health from one screen.",
      "/product/email-accounts",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: Unplug, title: "Buying and wiring up mailboxes takes weeks", text: "Domains, DNS records, SMTP credentials, warmup — all before a single email goes out." },
  { icon: TriangleAlert, title: "One burnt mailbox stalls everything", text: "When a single inbox gets throttled, campaigns silently slow down and nobody notices for days." },
  { icon: Gauge, title: "No visibility into capacity", text: "Without daily limits and health scores in one view, it is guesswork how much you can safely send." },
];

const solutionRows = [
  {
    eyebrow: "Fully managed",
    title: "Sending infrastructure you never have to configure",
    text: "MunchReach provisions, authenticates and warms the mailboxes behind your workspace. You pick a campaign and press send — no provider keys, no SMTP settings, no DNS work.",
    bullets: [
      "Authenticated domains with SPF, DKIM and DMARC in place",
      "Mailboxes warmed before they touch a real prospect",
      "Capacity added as your volume grows",
    ],
    visual: (
      <MockPanel title="Managed accounts — Acme workspace">
        <MockBars
          bars={[
            { label: "outreach@munchreachmail.com", value: 82, caption: "82 sent today · Healthy" },
            { label: "sam@getmunchreach.io", value: 61, caption: "61 sent today · Healthy" },
            { label: "hello@munchreach.dev", value: 24, caption: "24 sent today · Ramping" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Health monitoring",
    title: "Every mailbox scored, every day",
    text: "Bounce rate, spam placement, throttling signals and volume roll up into a single health score per account, with alerts the moment one drifts out of range.",
    visual: (
      <MockPanel title="Account health">
        <MockBars
          bars={[
            { label: "Deliverability", value: 95, caption: "95%" },
            { label: "Bounce rate", value: 8, caption: "0.8%" },
            { label: "Capacity used today", value: 57, caption: "57% of daily limit" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Rotation & limits",
    title: "Volume spread safely across your inboxes",
    text: "Campaigns rotate across the accounts assigned to your workspace with per-inbox daily caps, so no single mailbox ever carries more than it should.",
    visual: (
      <MockPanel title="Rotation — Q3 Outbound">
        <MockBars
          bars={[
            { label: "Round robin", value: 100, caption: "Active strategy" },
            { label: "Cap per inbox", value: 45, caption: "90 emails/day" },
            { label: "Accounts in rotation", value: 30, caption: "3 mailboxes" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Mailbox, title: "Managed mailboxes", text: "Provisioned, authenticated and warmed by MunchReach before you send." },
  { icon: RefreshCcw, title: "Inbox rotation", text: "Round robin, random or least-used rotation with per-inbox caps." },
  { icon: Activity, title: "Health scores", text: "One number per account covering deliverability, bounces and placement." },
  { icon: Timer, title: "Daily and hourly limits", text: "Hard ceilings that campaigns respect automatically." },
  { icon: ShieldCheck, title: "Reply-to routing", text: "Replies route back into your Unified Inbox, threaded to the campaign." },
  { icon: Layers, title: "Pause per account", text: "Rest a mailbox without touching the rest of your sending." },
];

const steps = [
  { title: "Create your workspace", text: "Managed sending accounts are assigned to it automatically." },
  { title: "Review capacity", text: "See daily limits, health and how much volume is available." },
  { title: "Launch campaigns", text: "Sending rotates across your accounts within safe limits." },
  { title: "Watch health", text: "Alerts fire early and volume shifts to healthier mailboxes." },
];

const bullets = [
  "No SMTP credentials or provider keys to manage",
  "Per-account sent-today and remaining-capacity counters",
  "Warmup status visible per mailbox",
  "Automatic failover away from unhealthy accounts",
  "Sending activity attributable to a specific mailbox",
  "Capacity requests handled by the MunchReach team",
];

const beforeAfter = {
  before: [
  "SMTP credentials pasted into a doc and shared over Slack",
  "No idea which mailbox is throttled, paused or failing",
  "DNS setup guessed once and never verified again"
],
  after: [
  "Credentials encrypted server-side and never returned to the browser",
  "Live per-mailbox health, caps and send counts",
  "Guided SPF, DKIM and DMARC verification before sending"
],
};

const useCases = [
  {
    "audience": "Google and Microsoft users",
    "scenario": "You want to send from existing work mailboxes safely.",
    "outcome": "Connect in minutes with warmup-aware limits."
  },
  {
    "audience": "Bring-your-own provider",
    "scenario": "You already pay for SES, Postmark, SendGrid or Mailgun.",
    "outcome": "Plug in your keys and keep your own reputation."
  },
  {
    "audience": "Managed sending",
    "scenario": "You would rather not run infrastructure at all.",
    "outcome": "MunchReach-managed domains and mailboxes, fully verified."
  }
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Email Accounts"
        title="Managed sending accounts,"
        highlight="monitored around the clock"
        description="MunchReach runs the mailboxes behind your outreach. Track health, limits and rotation for every account assigned to your workspace — without configuring a single provider."
        secondaryCta="See How It Works"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Email accounts dashboard"
        title="Every mailbox, capacity and health score in one view"
        description="Know exactly how much you can send today and which accounts are carrying it."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="Why teams struggle with sending infrastructure">
        <PainPoints items={painPoints} />
      </Section>
      <Section title="How MunchReach solves it" description="Infrastructure handled for you, visibility kept with you.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Included with every MunchReach workspace.">
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
            { value: "0", label: "Provider keys you have to manage" },
            { value: "24/7", label: "Health monitoring per mailbox" },
            { value: "3", label: "Rotation strategies available" },
            { value: "100%", label: "Sends kept inside safe daily limits" },
          ]}
        />
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <TestimonialCarousel page="email-accounts" title="Sending health, in their words" />
      <Section muted>
        <PageFaqs page="email-accounts" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Let MunchReach run your sending infrastructure"
        description="Managed, warmed and monitored mailboxes from the day you start."
      />
    </MarketingLayout>
  );
}
