import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Ban,
  Gauge,
  KeyRound,
  Layers,
  Mailbox,
  Pause,
  RefreshCcw,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Unplug,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  BulletList,
  CtaBlock,
  DocSection,
  FeatureGrid,
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
  { q: "How many mailboxes can I connect?", a: "As many as your plan allows. Each mailbox is added as its own account with its own domain, limits, health score and rotation settings, so scaling volume just means connecting more accounts." },
  { q: "What happens during domain verification?", a: "MunchReach checks your domain's SPF, DKIM and DMARC records before the mailbox is allowed to send. If a record is missing or misconfigured, the account is flagged and held back from sending until it's fixed." },
  { q: "What is the rolling 12-hour sending window?", a: "Instead of a hard reset at midnight, each account's send count is measured over the trailing 12 hours. That keeps volume smooth throughout the day and prevents a burst of sends right after a daily limit resets." },
  { q: "How does mailbox rotation actually work?", a: "Campaigns spread their volume across every healthy account assigned to them using round robin, random or least-used order, so no single inbox carries a disproportionate share of the send." },
  { q: "What triggers a safety block?", a: "Sudden bounce spikes, spam-trap hits, provider-side throttling, authentication failures or a burnt sending reputation can each trigger a safety block, which stops an account from sending until it's reviewed." },
  { q: "Can I pause a single mailbox without stopping campaigns?", a: "Yes. Pausing an account removes it from rotation immediately — active campaigns keep sending from your other healthy accounts instead of stopping entirely." },
  { q: "Do I need to manage SMTP credentials myself?", a: "No. Authentication is handled and stored server-side. You connect a mailbox through OAuth or a provider integration, and MunchReach manages the credentials from there." },
  { q: "How do I know if an account's sending health is dropping?", a: "Every account carries a live health score built from bounce rate, spam placement signals and provider responses. When it drops out of a safe range, you're alerted before it affects your campaigns." },
  { q: "Can I see provider status for each mailbox?", a: "Yes. Each account shows which provider it's on and whether that connection is live, degraded or disconnected, so you always know if an account is actually able to send." },
  { q: "What happens to replies if I pause an account?", a: "Nothing — pausing only affects new outbound sending. Replies to messages already sent from that mailbox still land in your Unified Inbox." },
];

export const Route = createFileRoute("/product/email-accounts")({
  head: () =>
    metaFor(
      "Email Accounts & Sending Infrastructure | MunchReach",
      "Connect and protect every sending mailbox: domain verification, SPF/DKIM/DMARC, rolling send limits, rotation, health scores and safety blocks in one place.",
      "/product/email-accounts",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: Unplug, title: "Connecting mailboxes safely is fiddly", text: "OAuth scopes, provider quirks, SPF/DKIM/DMARC records — one missed step and a mailbox lands in spam before it sends a single email." },
  { icon: TriangleAlert, title: "One burnt inbox drags everything down", text: "A single overworked or flagged mailbox can quietly tank deliverability for the whole domain while campaigns keep sending to it." },
  { icon: Gauge, title: "No shared view of capacity", text: "Without limits, health and rotation in one place, it's guesswork how much volume you can actually push today without risking your sender reputation." },
  { icon: Ban, title: "Recovering from a block is manual", text: "When a provider throttles or flags an account, most teams find out from a deliverability drop days later, not from the mailbox itself." },
];

const walkSteps = [
  {
    title: "Connect a mailbox",
    youDo: "Add a mailbox by OAuth (Google, Microsoft) or by connecting an SMTP/provider like SES, Postmark, SendGrid or Mailgun.",
    weHandle: "Credentials are validated and stored server-side; nothing is exposed to the browser.",
    youGet: "A new account row appears immediately, ready for domain verification.",
    visual: (
      <MockPanel title="Connect mailbox">
        <MockRows
          rows={[
            { left: "sam@getmunchreach.io", muted: "Google Workspace · OAuth", badge: "Connecting" },
            { left: "outreach@munchreachmail.com", muted: "Custom SMTP", badge: "Connecting" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Verify the domain",
    youDo: "Point SPF, DKIM and DMARC records at the values MunchReach generates for the sending domain.",
    weHandle: "DNS is checked automatically and rechecked on a schedule, not just once at setup.",
    youGet: "A pass/fail status per record, so you know exactly what's still missing.",
    visual: (
      <MockPanel title="Domain verification — munchreachmail.com">
        <MockRows
          rows={[
            { left: "SPF", muted: "TXT record", badge: "Verified" },
            { left: "DKIM", muted: "1024-bit selector", badge: "Verified" },
            { left: "DMARC", muted: "p=quarantine", badge: "Pending" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Set limits and warmup",
    youDo: "Choose a starting daily cap, or let warmup ramp it up gradually.",
    weHandle: "Send volume is tracked on a rolling 12-hour window, not a hard midnight reset.",
    youGet: "A safe, gradually increasing ceiling that won't spike a fresh mailbox's reputation.",
    visual: (
      <MockPanel title="Sending limits — sam@getmunchreach.io">
        <MockBars
          bars={[
            { label: "Sent, trailing 12h", value: 64, caption: "58 of 90" },
            { label: "Daily cap", value: 90, caption: "90 emails/day" },
            { label: "Warmup ramp", value: 30, caption: "Day 9 of 30" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Add it to rotation",
    youDo: "Assign the account to one or more campaigns.",
    weHandle: "Sends rotate across every healthy, unpaused account on the campaign using round robin, random or least-used order.",
    youGet: "Volume spread evenly instead of hammering one inbox.",
    visual: (
      <MockPanel title="Rotation — Q3 Outbound">
        <MockRows
          rows={[
            { left: "outreach@munchreachmail.com", muted: "Round robin", badge: "In rotation" },
            { left: "sam@getmunchreach.io", muted: "Round robin", badge: "In rotation" },
            { left: "hello@munchreach.dev", muted: "Ramping", badge: "Excluded" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Monitor health",
    youDo: "Check the health score whenever you like — it's live, not a weekly digest.",
    weHandle: "Bounce rate, spam placement, provider responses and authentication status roll up into one score per mailbox.",
    youGet: "An early warning before deliverability actually drops.",
    visual: (
      <MockPanel title="Account health — sam@getmunchreach.io">
        <MockBars
          bars={[
            { label: "Health score", value: 92, caption: "Healthy" },
            { label: "Bounce rate", value: 6, caption: "0.6%" },
            { label: "Provider status", value: 100, caption: "Connected" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Respond to alerts",
    youDo: "Pause, resume or dig into an account the moment you get flagged.",
    weHandle: "Safety blocks fire automatically on bounce spikes or auth failures, pulling the account out of rotation before it does more damage.",
    youGet: "A recoverable mailbox instead of a domain-wide deliverability problem.",
    visual: (
      <MockPanel title="Safety block — hello@munchreach.dev">
        <MockRows
          rows={[
            { left: "Reason", muted: "Bounce rate spike (4.2%)", badge: "Blocked" },
            { left: "Sending", muted: "Paused automatically", badge: "Paused" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Mailbox, title: "Multiple mailboxes per workspace", text: "Connect as many sending accounts as your plan allows, each managed and monitored on its own." },
  { icon: BadgeCheck, title: "Domain verification", text: "Every sending domain is checked against SPF, DKIM and DMARC before it's trusted with real volume." },
  { icon: ShieldCheck, title: "Authentication handled for you", text: "Connect by OAuth or provider credentials — MunchReach stores and manages them server-side." },
  { icon: Activity, title: "Live sending health", text: "One score per mailbox built from bounce rate, spam placement and provider responses." },
  { icon: Timer, title: "Rolling 12-hour limits", text: "Send caps measured on a trailing window instead of a hard daily reset, keeping volume smooth." },
  { icon: RefreshCcw, title: "Rotation strategies", text: "Round robin, random or least-used rotation spreads volume across every healthy account." },
  { icon: Gauge, title: "Provider status", text: "See whether each mailbox's connection to its provider is live, degraded or disconnected." },
  { icon: Pause, title: "Pause and resume controls", text: "Rest a single mailbox without pausing the campaigns it's part of." },
  { icon: AlertTriangle, title: "Automatic safety blocks", text: "Bounce spikes, spam-trap hits and auth failures pull an account out of rotation before it spreads damage." },
  { icon: KeyRound, title: "No exposed credentials", text: "SMTP keys and OAuth tokens never touch the browser — everything is encrypted server-side." },
  { icon: Layers, title: "Per-account attribution", text: "Every send and reply is tied back to the specific mailbox that handled it." },
  { icon: Unplug, title: "Bring your own provider", text: "Connect Google, Microsoft, SES, Postmark, SendGrid or Mailgun accounts, or use MunchReach-managed mailboxes instead." },
];

const workflowSteps = [
  { title: "Connect", text: "Add a mailbox via OAuth or provider credentials." },
  { title: "Verify", text: "Confirm SPF, DKIM and DMARC on the sending domain." },
  { title: "Warm up", text: "Ramp volume gradually before real campaigns touch it." },
  { title: "Set limits", text: "Cap sending on a rolling 12-hour window." },
  { title: "Rotate", text: "Assign to campaigns and spread volume across accounts." },
  { title: "Monitor", text: "Watch health scores and provider status live." },
  { title: "React", text: "Pause manually or let safety blocks catch problems." },
  { title: "Recover", text: "Resume once health and authentication check out again." },
];

const useCases = [
  { icon: Mailbox, audience: "Teams sending from Google or Microsoft", scenario: "You want to send outreach from existing work mailboxes without risking the domain.", outcome: "Connect via OAuth with warmup-aware limits and per-account health tracking." },
  { icon: Unplug, audience: "Teams with their own provider", scenario: "You already pay for SES, Postmark, SendGrid or Mailgun.", outcome: "Plug in your credentials and keep your own reputation while MunchReach handles rotation and limits." },
  { icon: ShieldCheck, audience: "Teams that want fully managed sending", scenario: "You'd rather not run any infrastructure at all.", outcome: "Use MunchReach-managed domains and mailboxes, verified and warmed before anything sends." },
  { icon: Layers, audience: "High-volume outbound teams", scenario: "You're sending across dozens of mailboxes across multiple domains.", outcome: "Rotation, per-inbox caps and health scores keep volume spread and reputations protected." },
  { icon: AlertTriangle, audience: "Teams recovering from a deliverability hit", scenario: "One or more mailboxes have been throttled or flagged before.", outcome: "Safety blocks and pause controls isolate problem accounts while the rest keep sending." },
  { icon: BadgeCheck, audience: "Teams onboarding a new sending domain", scenario: "You just registered a domain and need to start sending safely.", outcome: "Guided SPF/DKIM/DMARC setup plus warmup before real prospects are contacted." },
];

const docGroups = [
  {
    title: "Mailboxes & authentication",
    items: [
      "Connect unlimited mailboxes per workspace, each tracked independently",
      "OAuth connections for Google and Microsoft accounts",
      "Provider credentials supported for SES, Postmark, SendGrid and Mailgun",
      "Credentials encrypted and stored server-side, never returned to the browser",
    ],
  },
  {
    title: "Domain & sending health",
    items: [
      "SPF, DKIM and DMARC checked before an account is trusted to send",
      "DNS records rechecked on a schedule, not just once at setup",
      "Live health score built from bounce rate, spam placement and provider responses",
      "Provider status shown per mailbox: live, degraded or disconnected",
    ],
  },
  {
    title: "Limits, rotation & controls",
    items: [
      "Sending volume measured on a rolling 12-hour window, not a fixed daily reset",
      "Round robin, random and least-used rotation strategies across accounts",
      "Pause and resume any mailbox without affecting the rest of a campaign",
      "Automatic safety blocks on bounce spikes, spam-trap hits or auth failures",
    ],
  },
];

const bullets = [
  "Per-account sent-in-last-12-hours and remaining-capacity counters",
  "SPF, DKIM, DMARC and MX status shown individually per domain",
  "Provider connection state visible without leaving the account list",
  "Warmup progress tracked separately from live campaign sending",
  "Bulk pause and resume across selected accounts",
  "Rotation strategy configurable per campaign, not locked platform-wide",
  "Safety blocks list the exact reason an account was pulled from rotation",
  "Replies stay routed to the Unified Inbox even while an account is paused",
  "Filtering by status, warmup state, health and domain across large account lists",
  "Live status updates as accounts are assigned, paused or reconnected",
];

const beforeAfter = {
  before: [
    "SMTP credentials pasted into a doc and shared over chat",
    "No idea which mailbox is throttled, paused or failing until deliverability drops",
    "DNS records set up once, guessed at, and never checked again",
    "One overworked inbox carrying most of a campaign's volume",
    "A flagged mailbox keeps sending until someone happens to notice",
  ],
  after: [
    "Credentials encrypted server-side and never exposed to the browser",
    "Live per-mailbox health, provider status and rolling send counts",
    "Guided SPF, DKIM and DMARC verification, rechecked on a schedule",
    "Volume spread automatically across every healthy account in rotation",
    "Safety blocks pull a flagged mailbox out of sending immediately",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Email Accounts"
        title="Every sending mailbox,"
        highlight="verified and protected"
        description="Connect Google, Microsoft or your own provider, verify the domain, and let MunchReach watch sending health, limits and rotation for every account in your workspace."
        benefits={[
          "SPF, DKIM and DMARC verified before sending",
          "Rolling 12-hour sending limits per mailbox",
          "Automatic safety blocks on bounce spikes and auth failures",
        ]}
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="Email accounts dashboard"
        title="Every mailbox, its limits, and its health score in one view"
        description="See exactly how much each account can send right now and whether it's actually healthy enough to send it."
      >
        <div className="p-4 sm:p-6">
          <MockPanel title="Email accounts — Acme workspace">
            <MockRows
              rows={[
                { left: "outreach@munchreachmail.com", muted: "82 sent · trailing 12h · SPF/DKIM/DMARC ✓", badge: "Healthy" },
                { left: "sam@getmunchreach.io", muted: "61 sent · trailing 12h · Round robin", badge: "Healthy" },
                { left: "hello@munchreach.dev", muted: "Bounce rate 4.2% · auto safety block", badge: "Blocked" },
                { left: "team@munchreachmail.com", muted: "Paused manually", badge: "Paused" },
              ]}
            />
          </MockPanel>
        </div>
      </BigPreview>
      <Section title="Why sending infrastructure keeps breaking outreach">
        <PainPoints items={painPoints} />
      </Section>
      <Section id="how-it-works" title="How email accounts work in MunchReach" description="From connecting a mailbox to catching problems before they spread.">
        <Walkthrough steps={walkSteps} />
      </Section>
      <Section title="What you get" description="Everything needed to connect, verify and protect a sending mailbox.">
        <FeatureGrid items={features} />
      </Section>
      <Section title="The end-to-end sending workflow" description="What happens to a mailbox from the moment you connect it.">
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who it's for" description="Built for however your team sources sending capacity.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep capabilities" description="What's actually happening behind each account.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch.">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="email-accounts" title="Sending health, in their words" />
      <Section muted>
        <PageFaqs page="email-accounts" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Connect and protect every sending account you own"
        description="Verified domains, live health scores and automatic safety blocks — so no single mailbox can put your outreach at risk."
      />
    </MarketingLayout>
  );
}
