import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  CircleSlash,
  Files,
  Flame,
  Inbox,
  KeyRound,
  Plug,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Split,
  Users,
  Wallet,
} from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  FeatureGrid,
  FeatureBento,
  PainPoints,
  SolutionSplit,
  MockPanel,
  MockRows,
  MockBars,
  CtaBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";


export const Route = createFileRoute("/why-sendloop")({
  head: () =>
    metaFor(
      "Why Sendloop — One Workspace Instead of Six Outbound Tools",
      "Campaigns, unified inbox, CRM, warmup, analytics and automation on infrastructure you own. See why outbound teams consolidate on Sendloop.",
      "/why-sendloop",
    ),
  component: WhySendloop,
});

const problems = [
  {
    icon: Boxes,
    title: "Six tools, one workflow",
    text: "A sequencer, a mailbox provider, a warmup service, a spreadsheet and a CRM — each with its own idea of what a contact is.",
  },
  {
    icon: Files,
    title: "Data that never reconciles",
    text: "Replies live in one tool, opens in another, deal stage in a third. Reporting becomes a manual export job.",
  },
  {
    icon: CircleSlash,
    title: "Rented sending reputation",
    text: "Shared pools and vendor-owned domains mean someone else's list quality decides whether your email lands.",
  },
  {
    icon: Inbox,
    title: "Replies that go cold",
    text: "Positive answers sit unread in a mailbox nobody owns while the sequence keeps firing follow-ups.",
  },
  {
    icon: Wallet,
    title: "Stacked subscriptions",
    text: "Per-seat sequencer, per-mailbox warmup, per-contact CRM. Cost grows faster than pipeline.",
  },
  {
    icon: Split,
    title: "No single source of truth",
    text: "When a campaign underperforms, nobody can say whether it was the list, the copy or the mailbox.",
  },
];

const unified = [
  { icon: Send, title: "Campaigns", text: "Multi-step sequences with variants, sending windows and per-mailbox pacing." },
  { icon: Inbox, title: "Unified Inbox", text: "Every reply from every mailbox in one thread view your whole team can work." },
  { icon: Users, title: "CRM", text: "Contacts, pipeline stages, tasks and notes that update as replies come in." },
  { icon: Flame, title: "Warmup", text: "Continuous warmup and health scoring on the mailboxes you actually send from." },
  { icon: BarChart3, title: "Analytics", text: "Sent, delivered, opened, replied and bounced by campaign, mailbox and day." },
  { icon: Repeat, title: "Automations", text: "Triggers, conditions, waits and actions that run without anyone watching." },
];

const controlRows = [
  {
    eyebrow: "Sending infrastructure",
    title: "Control over how every message is sent",
    text: "Sendloop schedules across the mailboxes you connect, respects per-account daily limits and sending windows, and pauses accounts whose health drops instead of pushing volume through them.",
    bullets: [
      "Per-mailbox daily caps, ramp-up and sending windows",
      "Rotation across accounts so no single mailbox carries a campaign",
      "Automatic pause on bounce and complaint thresholds",
      "Delivery diagnostics on every test and live send",
    ],
    visual: (
      <MockPanel title="Sending accounts">
        <MockRows
          rows={[
            { left: "ava@yourdomain.com", muted: "Warmup complete", badge: "Healthy", right: "42 / 60 today" },
            { left: "sam@yourdomain.com", muted: "Ramping up", badge: "Warming", right: "18 / 30 today" },
            { left: "team@yourdomain.io", muted: "Bounce rate above target", badge: "Paused", right: "0 today" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Domains & mailboxes",
    title: "Your domains, your mailboxes, your reputation",
    text: "You verify SPF, DKIM and DMARC on domains you own, then connect the mailboxes behind them. Sending reputation is built on assets that stay with you, not on a shared pool you rent by the month.",
    bullets: [
      "DNS verification before a domain can send",
      "Bring your own provider: SMTP, SES, SendGrid, Mailgun, Postmark, Resend and more",
      "Credentials stored encrypted and never shown back in plain text",
      "Leave whenever you want — the domains keep working",
    ],
    visual: (
      <MockPanel title="Domain verification">
        <MockRows
          rows={[
            { left: "SPF", muted: "v=spf1 include:… -all", badge: "Verified" },
            { left: "DKIM", muted: "selector._domainkey", badge: "Verified" },
            { left: "DMARC", muted: "p=quarantine; rua=…", badge: "Verified" },
            { left: "Custom tracking domain", muted: "link.yourdomain.com", badge: "Verified" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Analytics",
    title: "Numbers you can act on the same day",
    text: "Every send, delivery, open, click, reply, bounce and unsubscribe is recorded against the campaign, the step and the mailbox that produced it — so the funnel explains itself.",
    bullets: [
      "Conversion funnel from sent through to replied",
      "Per-mailbox and per-campaign breakdowns",
      "Trends over any date range, not just the last 7 days",
      "Reply volume tied back to the exact step and variant",
    ],
    visual: (
      <MockPanel title="Campaign performance">
        <MockBars
          bars={[
            { label: "Delivered", value: 97 },
            { label: "Opened", value: 54 },
            { label: "Replied", value: 11 },
            { label: "Bounced", value: 2 },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Automation & AI",
    title: "Follow-up that keeps running when you don't",
    text: "Automations react to what actually happened — a reply, a bounce, a stage change — and AI personalization drafts the opening line from the lead data you already imported.",
    bullets: [
      "Trigger → condition → action → wait workflows",
      "Stop sequences the moment a prospect replies",
      "AI-written personalization grounded in your lead fields",
      "Preview and test every message before it goes out",
    ],
    visual: (
      <MockPanel title="Automation run">
        <MockRows
          rows={[
            { left: "Trigger: reply received", muted: "Campaign — Q3 agencies", badge: "Fired" },
            { left: "Condition: sentiment positive", muted: "Classified from reply body", badge: "Match" },
            { left: "Action: stop follow-ups", muted: "Remaining steps cancelled", badge: "Done" },
            { left: "Action: move to Interested", muted: "CRM pipeline updated", badge: "Done" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const platform = [
  { icon: Users, title: "CRM built into outreach", text: "Contacts are created from real replies, then moved through stages with tasks, notes and an activity timeline." },
  { icon: Plug, title: "Integrations", text: "Connect the tools your team already runs so leads and outcomes flow both ways." },
  { icon: ShieldCheck, title: "Security and isolation", text: "Row-level workspace isolation, role-based access and encrypted provider credentials." },
  { icon: KeyRound, title: "Roles for real teams", text: "Owner, admin, campaign manager, inbox manager, analyst and client viewer permissions." },
  { icon: Sparkles, title: "AI where it helps", text: "Personalization and reply classification — not a chatbot bolted onto the sidebar." },
];

const audiences = [
  {
    icon: Building2,
    title: "Agencies",
    text: "A separate workspace per client, with its own domains, mailboxes, pipeline and reporting — and client viewer access when they want to look.",
  },
  {
    icon: Users,
    title: "Sales teams",
    text: "Shared inbox ownership, per-rep mailboxes and analytics that show which sequences produce conversations, not just opens.",
  },
  {
    icon: Send,
    title: "Growing businesses",
    text: "Start with one domain and one mailbox, add capacity as warmup completes, and keep everything in one place as the team grows.",
  },
];

const comparison = [
  { capability: "Campaign sequencing", stitched: false, sendloop: true },
  { capability: "Replies in a shared inbox", stitched: false, sendloop: true },
  { capability: "Warmup on the mailboxes you send from", stitched: false, sendloop: true },
  { capability: "CRM records created from replies", stitched: false, sendloop: true },
  { capability: "One analytics view across all of it", stitched: false, sendloop: true },
  { capability: "Your own domains and mailboxes", stitched: false, sendloop: true },
  { capability: "Automations across every object", stitched: false, sendloop: true },
  { capability: "One bill, one login, one permission model", stitched: false, sendloop: true },
];

function WhySendloop() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Why Sendloop"
        title="Stop running outbound across"
        highlight="six disconnected tools"
        description="Campaigns, replies, contacts, warmup, analytics and automation belong to the same workflow. Sendloop puts them in one workspace, on sending infrastructure you own."
        primaryCta="Start for Free"
      />

      <Section
        title="The problem with fragmented outreach stacks"
        description="Nothing here is a tooling opinion — it's what happens when each part of outbound lives in a different system."
      >
        <PainPoints items={problems} />
      </Section>

      <Section
        muted
        title="One workspace for the whole loop"
        description="Send, get replies, qualify, follow up, report. Same data, same permissions, same place."
      >
        <FeatureBento items={unified} />
      </Section>

      <Section
        title="Control, not guesswork"
        description="Four areas where owning the infrastructure changes the outcome."
      >
        <SolutionSplit rows={controlRows} />
      </Section>

      <Section muted title="The rest of the platform">
        <FeatureGrid items={platform} />
      </Section>

      <Section
        title="Built for the teams doing the sending"
        description="Different shapes of outbound, one operating model."
      >
        <FeatureGrid items={audiences} />
      </Section>

      <Section
        muted
        title="Stitched stack vs. Sendloop"
        description="What changes when the tools stop being separate."
      >
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Capability</span>
            <span className="w-24 text-center">Stitched stack</span>
            <span className="w-24 text-center">Sendloop</span>
          </div>
          {comparison.map((row) => (
            <div
              key={row.capability}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border/60 px-5 py-3.5 text-sm last:border-b-0"
            >
              <span>{row.capability}</span>
              <span className="flex w-24 justify-center">
                <span className="text-xs text-muted-foreground">Separate tool</span>
              </span>
              <span className="flex w-24 justify-center">
                <Check className="size-4 text-primary" aria-label="Included" />
              </span>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-muted-foreground">
          &ldquo;Separate tool&rdquo; means the capability exists, but in a different product with its own data, billing and access rules.
        </p>
      </Section>

      <TestimonialCarousel page="why-sendloop" />


      <CtaBlock
        title="Consolidate your outbound stack"
        description="Create a free workspace, connect a domain and see the whole loop in one place."
      />
    </MarketingLayout>
  );
}
