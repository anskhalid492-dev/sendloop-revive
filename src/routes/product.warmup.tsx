import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Flame,
  Gauge,
  Inbox,
  MailCheck,
  Pause,
  Play,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ThermometerSnowflake,
  TrendingUp,
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
  { q: "How long does warmup take?", a: "Two to four weeks for a brand new domain, depending on your ramp settings. Established domains with a clean history often reach a healthy sending volume in about a week." },
  { q: "Can I send real campaigns while a mailbox is warming up?", a: "Yes. Warmup runs alongside campaign sending. As health improves, the ramp raises the safe daily volume automatically, and campaigns never exceed it." },
  { q: "What exactly triggers an automatic pause?", a: "Bounce rate above your configured threshold, a spam complaint, an authentication failure, or a health score that drops below your minimum. Any of these blocks new sending immediately." },
  { q: "Once a mailbox is auto-paused, how do I get it sending again?", a: "Fix the underlying cause — a bad list, a DNS record, a spike in bounces. Once the rate that triggered the block falls back under your limit, the block clears and you can resume from the warmup page." },
  { q: "Does resuming a mailbox override an active safety block?", a: "No. If the condition that caused the pause is still active, resuming is refused and you're told exactly why, instead of silently putting the mailbox back at risk." },
  { q: "What counts toward my daily warmup target versus my campaign volume?", a: "Warmup emails and campaign emails are tracked and counted separately, but they share the same mailbox and the same daily sending ceiling so the mailbox is never pushed past what it can handle." },
  { q: "Do warmup emails ever reach a real prospect?", a: "No. Warmup sends and replies happen between mailboxes in the warmup network, never to a prospect on your list." },
  { q: "How is a mailbox's health score calculated?", a: "It combines inbox placement, bounce rate, spam-complaint signals and how much of the daily target is being delivered successfully, rolled into a single score per mailbox." },
  { q: "Can I pause warmup manually without losing my ramp progress?", a: "Yes. Turning warmup off keeps your accumulated progress; turning it back on resumes the ramp rather than starting over from the first day." },
  { q: "Do I need to connect a mailbox to a domain I already send campaigns from?", a: "Most teams warm the exact mailbox and domain they plan to send campaigns from, since reputation is built per domain and per mailbox, not transferred between them." },
];

export const Route = createFileRoute("/product/warmup")({
  head: () =>
    metaFor(
      "Cold Email Warmup: Better Deliverability | MunchReach",
      "Warm up your email accounts, monitor mailbox health, and build a stronger sending reputation before scaling your cold outreach.",
      "/product/warmup",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: ThermometerSnowflake, title: "Cold mailboxes get flagged fast", text: "A brand new domain sending 200 emails on day one looks exactly like a spammer to every major provider, no matter how good the copy is." },
  { icon: Inbox, title: "Landing in spam, silently", text: "Without placement visibility, a whole campaign can run without you ever knowing it never reached the inbox tab." },
  { icon: ShieldAlert, title: "One bad sequence, weeks of damage", text: "A bounce or complaint spike can tank sender reputation in hours, and recovery takes far longer than the campaign that caused it." },
  { icon: AlertTriangle, title: "No warning before the damage is done", text: "By the time reply rates collapse, the mailbox has already been throttled or blacklisted — the alert that should have paused sending never existed." },
];

const walkthroughSteps = [
  {
    title: "Connect the mailbox",
    youDo: "Add your sending account with its SMTP/IMAP or provider credentials.",
    weHandle: "Authentication is checked automatically — SPF, DKIM, DMARC and the tracking domain are verified before warmup can start.",
    youGet: "A mailbox that's either confirmed ready or flagged with exactly what to fix first.",
    visual: (
      <MockPanel title="Connect mailbox — sam@munchreach.dev">
        <MockRows
          rows={[
            { left: "SPF record", right: "Verified", badge: "Pass" },
            { left: "DKIM signature", right: "Verified", badge: "Pass" },
            { left: "DMARC policy", right: "p=none — recommend p=quarantine", badge: "Warning" },
            { left: "Tracking domain (CNAME)", right: "Verified", badge: "Pass" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Configure warmup",
    youDo: "Set a starting volume, a daily target ceiling, and a ramp speed for the mailbox.",
    weHandle: "The ramp schedule, bounce and health thresholds, and send-day/send-hour windows are stored per mailbox.",
    youGet: "A ramp plan that fits the domain's age instead of a one-size-fits-all default.",
    visual: (
      <MockPanel title="Warmup settings">
        <MockRows
          rows={[
            { left: "Starting volume", right: "5 emails/day" },
            { left: "Target volume", right: "40 emails/day" },
            { left: "Daily increase", right: "+2 emails/day" },
            { left: "Ramp length", right: "18 days" },
            { left: "Auto-pause on risk", right: "On", badge: "Enabled" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Gradual sending",
    youDo: "Nothing — warmup runs quietly in the background, including weekends.",
    weHandle: "Volume increases day over day toward the target, and drops back automatically if health dips, instead of climbing on a fixed schedule regardless of reputation.",
    youGet: "A mailbox that ramps up reputation the way a real, trusted inbox would build it.",
    visual: (
      <MockPanel title="Warmup ramp — 18-day plan">
        <MockBars
          bars={[
            { label: "Week 1", value: 20, caption: "8 emails/day" },
            { label: "Week 2", value: 55, caption: "22 emails/day" },
            { label: "Week 3", value: 90, caption: "36 emails/day" },
            { label: "Day 18", value: 100, caption: "40 emails/day · target reached" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Delivery monitoring",
    youDo: "Check the dashboard whenever you want a status update.",
    weHandle: "Every warmup send is tracked for inbox placement, spam placement and reply engagement, with anything landing in spam automatically moved to the inbox and marked not-spam.",
    youGet: "A live read on whether the mailbox is actually reaching the inbox, not just whether emails are being sent.",
    visual: (
      <MockPanel title="Placement — last 7 days">
        <MockBars
          bars={[
            { label: "Inbox placement", value: 94, caption: "94%" },
            { label: "Spam placement", value: 4, caption: "4% (auto-rescued)" },
            { label: "Reply engagement", value: 71, caption: "71%" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Safety checks",
    youDo: "Nothing — the safety guard evaluates every mailbox continuously.",
    weHandle: "Bounce rate, complaint signals, authentication failures and health score are all checked against your thresholds before each send batch goes out.",
    youGet: "An automatic block the moment a mailbox crosses a risk threshold, before more damage compounds.",
    visual: (
      <MockPanel title="Safety guard — hello@munchreachmail.com">
        <MockRows
          rows={[
            { left: "Bounce rate", right: "6.2% (limit 5%)", badge: "Blocked" },
            { left: "Spam complaints", right: "0 in last 24h", badge: "Pass" },
            { left: "Health score", right: "41 (minimum 50)", badge: "Blocked" },
            { left: "Status", right: "Sending paused automatically" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Healthy mailbox",
    youDo: "Resume sending once you've fixed whatever triggered the pause.",
    weHandle: "The block only clears once the rate that caused it falls back under your limit — resuming is refused otherwise, so you can't accidentally re-trigger the same problem.",
    youGet: "A mailbox with a stable health score, ready to carry full campaign volume.",
    visual: (
      <MockPanel title="Mailbox health overview">
        <MockBars
          bars={[
            { label: "sam@munchreach.dev", value: 96, caption: "96 · Healthy" },
            { label: "hello@munchreachmail.com", value: 74, caption: "74 · Resumed after bounce rate cleared" },
            { label: "outreach@getmunchreach.io", value: 34, caption: "34 · Still blocked" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Flame, title: "Gradual ramp-up", text: "Volume starts small and climbs day by day toward your target, following a schedule tuned to domain age and current health." },
  { icon: TrendingUp, title: "Real conversations", text: "Warmup emails are opened, replied to and marked important by a network of live mailboxes — never sent to an actual prospect." },
  { icon: MailCheck, title: "Spam-folder rescue", text: "Messages that land in spam are detected and automatically moved to the inbox and marked not-spam." },
  { icon: ShieldCheck, title: "Authentication checks", text: "SPF, DKIM, DMARC and tracking-domain validation run before warmup starts and are monitored afterward." },
  { icon: Gauge, title: "Mailbox health score", text: "One number per mailbox combining deliverability, bounce rate, spam placement and volume delivered against target." },
  { icon: AlertTriangle, title: "Automatic safety pausing", text: "Sending stops the moment bounce rate, complaints, authentication or health cross a configured threshold — no manual watching required." },
  { icon: RefreshCcw, title: "Automatic resuming", text: "Once the rate that triggered a block falls back under the limit, the mailbox is eligible to resume — but never re-enables itself silently." },
  { icon: Play, title: "Manual resume with a real check", text: "Resuming a paused mailbox re-checks the block condition first; if it's still active, resume is refused with the exact reason shown." },
  { icon: Pause, title: "Pause without losing progress", text: "Turning warmup off keeps your accumulated ramp progress, so turning it back on continues rather than restarting from day one." },
  { icon: Activity, title: "Delivery signal tracking", text: "Inbox placement, spam placement, bounces and replies are recorded per mailbox, per day, so trends are visible before they become problems." },
  { icon: ShieldAlert, title: "Bounce and complaint protection", text: "Bounce rate and complaint signals are checked against your configured maximums on every send cycle, not just at setup." },
  { icon: Inbox, title: "Sending limit enforcement", text: "Campaigns and warmup share a single daily ceiling per mailbox, so no combination of sends can push a mailbox past a safe volume." },
];

const workflowSteps = [
  { title: "Connect mailbox", text: "Add SMTP/IMAP or provider credentials for the account you plan to send from." },
  { title: "Configure warmup", text: "Set starting volume, target volume, ramp speed and safety thresholds." },
  { title: "Gradual sending", text: "Daily volume increases automatically, including weekends, toward your target." },
  { title: "Delivery monitoring", text: "Inbox placement, spam placement and reply engagement are tracked every day." },
  { title: "Safety checks", text: "Bounce rate, complaints, authentication and health score are checked before every send." },
  { title: "Automatic pausing", text: "Sending is blocked immediately if any threshold is crossed, before the reputation hit spreads." },
  { title: "Rate clears, block resolves", text: "Once the rate that caused the pause drops back under the limit, the mailbox becomes eligible to resume." },
  { title: "Healthy mailbox", text: "Warmed reputation carries full campaign volume with continued health monitoring in the background." },
];

const docGroups = [
  {
    title: "Ramping and status",
    items: [
      "Configurable starting volume, daily increase and target volume per mailbox",
      "Ramp length in days, with progress preserved if warmup is paused and resumed manually",
      "Per-mailbox warmup status: off, ramping (\"on\"), or blocked",
      "Ramp speed adapts to current health score — volume growth slows automatically when health dips into a lower band",
      "Send-day and send-hour windows so warmup traffic follows a human sending pattern",
    ],
  },
  {
    title: "Health, monitoring and delivery signals",
    items: [
      "A single health score per mailbox combining placement, bounce rate and complaint signals",
      "Inbox placement, spam placement, bounce count and reply count tracked daily per mailbox",
      "Spam-placed warmup messages automatically moved to the inbox and marked not-spam",
      "Live status view showing sent-today against today's target for every connected mailbox",
    ],
  },
  {
    title: "Safety protection, pausing and resuming",
    items: [
      "Configurable maximum bounce rate and minimum health score per mailbox",
      "Automatic sending pause the moment bounce rate, complaints, authentication failure or health score cross a threshold",
      "Pause reason recorded and shown plainly so you know exactly what triggered the block",
      "A block only clears once the specific rate that caused it falls back under the configured limit",
      "Manual resume re-checks the block condition first and is refused — with the reason shown — if it is still active",
      "Auto-pause can be toggled off per mailbox for teams that want to manage risk manually",
    ],
  },
];

const bullets = [
  "Warmup and campaign sends share one daily ceiling per mailbox, tracked separately for reporting",
  "Authentication (SPF, DKIM, DMARC, tracking domain) checked before warmup can start",
  "Daily and hourly send windows to keep warmup traffic looking human, including weekends",
  "Health score recalculated continuously as new delivery signals come in",
  "Pausing warmup manually preserves ramp progress instead of resetting the schedule",
  "Automatic pause reasons distinguish bounce-rate protection, complaint protection and health-score blocks",
  "Resuming a blocked mailbox is refused if the triggering condition is still active",
  "Spam-placed warmup emails are rescued to the inbox and marked not-spam automatically",
  "Per-mailbox reporting on sent, inbox-placed, spam-placed, bounced and replied counts",
  "Ramp speed reduces automatically when health score drops, rather than continuing to climb blindly",
];

const beforeAfter = {
  before: [
    "A brand-new domain sends 200 cold emails on day one",
    "Nobody notices a bounce spike until reply rate collapses",
    "A risky mailbox keeps sending campaign volume while reputation quietly drops",
    "Resuming a paused mailbox just turns sending back on, regardless of the cause",
    "DNS records are configured once and never checked again",
  ],
  after: [
    "Automated ramp-up with human-like reply patterns tuned to domain age",
    "Continuous bounce, complaint and health monitoring on every mailbox",
    "Sending pauses automatically the moment a threshold is crossed",
    "Resume checks the block condition first and only clears once the rate is back under the limit",
    "Authentication is verified at setup and monitored for drift afterward",
  ],
};

const useCases = [
  { icon: ThermometerSnowflake, audience: "New domains", scenario: "You just bought sending domains and cannot risk burning them on day one.", outcome: "A warmed, inbox-placing mailbox in weeks instead of months." },
  { icon: RefreshCcw, audience: "Recovering senders", scenario: "Reputation dropped after an aggressive campaign or a bad list.", outcome: "Automatic pausing stops the bleeding, then a guided ramp rebuilds health." },
  { icon: Gauge, audience: "High-volume teams", scenario: "Dozens of mailboxes across multiple domains need to stay healthy at once.", outcome: "Fleet-wide health scores and safety status in a single view." },
  { icon: ShieldCheck, audience: "Agencies managing client domains", scenario: "Client reputation damage is a client relationship problem, not just a metric.", outcome: "Safety protection catches problems automatically, before a client notices." },
  { icon: Activity, audience: "Teams scaling send volume", scenario: "You want to raise daily volume without guessing what a mailbox can handle.", outcome: "Ramp targets and sending limits increase together, based on real health data." },
  { icon: AlertTriangle, audience: "Teams that got burned before", scenario: "A previous cold-sending mistake taught you to want guardrails, not just tools.", outcome: "Bounce and complaint protection block risky sending automatically, every time." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Warmup"
        title="Email warmup that builds"
        highlight="a sending reputation you can trust"
        description="New domains and cold mailboxes need reputation before they can send at volume. Warmup ramps sending gradually, watches every delivery signal, and pauses automatically the instant something goes wrong."
        benefits={[
          "Automatic ramp-up tuned to mailbox health",
          "Bounce, complaint and authentication protection built in",
          "Sending pauses and resumes without you watching a dashboard all day",
        ]}
        primaryCta="Start for Free"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="Warmup dashboard"
        title="Every mailbox's ramp, health and status in one view"
        description="Sent-today, target, health score and safety status update as warmup runs."
      >
        <MockPanel title="Warmup — connected mailboxes">
          <MockRows
            rows={[
              { left: "sam@munchreach.dev", muted: "Ramping · 32/40 today", right: "96", badge: "Healthy" },
              { left: "hello@munchreachmail.com", muted: "Blocked · bounce protection", right: "41", badge: "Blocked" },
              { left: "outreach@getmunchreach.io", muted: "Ramping · 8/12 today", right: "68", badge: "Ramping" },
            ]}
          />
        </MockPanel>
      </BigPreview>
      <Section title="Why new domains land in spam">
        <PainPoints items={painPoints} />
      </Section>
      <Section id="how-it-works" title="How warmup actually works" description="From connecting a mailbox to a reputation that can carry full campaign volume.">
        <Walkthrough steps={walkthroughSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="The end-to-end warmup workflow" description="What actually happens between connecting a mailbox and sending at full volume.">
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually protect sending reputation.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep warmup capabilities" description="What's actually configurable and monitored under the hood.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="warmup" title="Deliverability, in their words" />
      <Section muted>
        <PageFaqs page="warmup" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Build healthier sending infrastructure, one mailbox at a time"
        description="Warmup, monitor and protect every mailbox automatically — so reputation is an asset, not a risk you're managing by hand."
      />
    </MarketingLayout>
  );
}
