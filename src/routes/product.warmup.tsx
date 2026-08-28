import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Ban,
  Building2,
  Flame,
  Gauge,
  Globe,
  KeyRound,
  Pause,
  ShieldCheck,
  SlidersHorizontal,
  ThermometerSnowflake,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  DetailPanel,
  MailboxManagementMock,
  PauseVsBlock,
  RampNote,
  RampSteps,
  SafetySignalsMock,
  WarmupDashboardMock,
  WarmupScreenNotes,
} from "@/components/site/WarmupProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "How does warmup actually work?",
    a: "Instead of letting a brand new mailbox send at full volume immediately, MunchReach keeps sending to a controlled level and raises it in stages while watching bounce rate, complaints, authentication and mailbox health. If a signal looks wrong, the mailbox slows down or stops rather than pushing more volume through it.",
  },
  {
    q: "How long should a mailbox warm up before I scale?",
    a: "It depends on the domain, the provider and how your list behaves, so MunchReach does not put a fixed number on it. The ramp stage and health shown on the mailbox are what to watch — move volume up as the account progresses through stages without triggering safety conditions.",
  },
  {
    q: "Can I run campaigns while a mailbox is still warming up?",
    a: "Yes. Warmup and campaign sending share the same mailbox and the same capacity, so campaigns are limited by whatever the mailbox can currently send. Warmup activity is kept out of your campaign reporting and out of the workspace activity feed.",
  },
  {
    q: "What happens when a mailbox is blocked?",
    a: "The mailbox is taken out of sending while the safety condition is active, and the specific reason — bounce-rate protection, complaints or authentication — is shown on the account. Your other mailboxes continue sending, so a campaign does not stop because of one account.",
  },
  {
    q: "How does resume work?",
    a: "Resume clears manual and temporary pauses. It does not bypass a safety condition that is still active: the mailbox is re-checked first, and if the condition no longer applies the mailbox becomes resumable instead of staying stuck forever.",
  },
  {
    q: "What happens when a mailbox reaches its sending capacity?",
    a: "It pauses for the rest of the current rolling 12-hour window, and only accepted sends count toward that limit. This is a temporary capacity pause, not a safety block — capacity returns as the window rolls forward and other mailboxes keep sending in the meantime.",
  },
];

export const Route = createFileRoute("/product/warmup")({
  head: () =>
    metaFor(
      "Email Warmup — Ramp Mailboxes Safely | MunchReach",
      "Warm up new sending accounts gradually, monitor mailbox health, and let automatic safety pauses protect your sending reputation before you scale outbound volume.",
      "/product/warmup",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: ThermometerSnowflake,
    title: "Cold mailbox",
    text: "A brand new account with no sending history that suddenly pushes hundreds of emails looks nothing like a normal mailbox.",
  },
  {
    icon: AlertTriangle,
    title: "Poor deliverability",
    text: "Sending more does not help if messages are landing in spam — the volume just makes the pattern worse.",
  },
  {
    icon: Gauge,
    title: "Reputation damage",
    text: "Bounces and complaints follow the domain, so bad early sending behaviour affects the campaigns you run months later.",
  },
];

const screenNotes = [
  {
    title: "Check health before you raise volume",
    text: "Health, warmup status and safety state sit on the same row, so you can tell whether a mailbox is ready for more sending.",
  },
  {
    title: "Read the limit, not just the count",
    text: "Volume is shown against the mailbox's own limit for the current window, so a full mailbox is obvious at a glance.",
  },
  {
    title: "Understand why a mailbox stopped",
    text: "A capacity pause and a safety block look different, and the reason is written on the row instead of hidden in logs.",
  },
  {
    title: "Act on the right mailbox",
    text: "Pause or resume a single sending account without touching the rest of your infrastructure.",
  },
];

const steps = [
  {
    title: "Connect mailbox",
    text: "Add the sending account to your workspace and let MunchReach verify that it can authenticate and send.",
  },
  {
    title: "Start with controlled volume",
    text: "The mailbox begins at a low daily limit instead of whatever your campaign would like to send.",
  },
  {
    title: "Gradually increase sending",
    text: "The mailbox moves through ramp stages, raising its limit as it builds a consistent sending history.",
  },
  {
    title: "Monitor health and safety",
    text: "Bounce rate, complaints, authentication and health are checked continuously, and sending slows or stops when a signal breaks.",
  },
];

const features = [
  { icon: TrendingUp, title: "Gradual volume ramp", text: "Sending starts low and increases in stages instead of jumping to full volume." },
  { icon: SlidersHorizontal, title: "Mailbox-level limits", text: "Each account has its own limit for the current sending window." },
  { icon: Activity, title: "Health monitoring", text: "Mailbox health is tracked and shown next to warmup state." },
  { icon: AlertTriangle, title: "Bounce protection", text: "Rising bounce rates hold sending on that mailbox instead of continuing." },
  { icon: Ban, title: "Complaint protection", text: "Spam complaints trigger a safety condition on the affected account." },
  { icon: Pause, title: "Automatic safety pauses", text: "Sending stops on its own when a safety signal is breached." },
  { icon: KeyRound, title: "Authentication checks", text: "Sending authentication is verified so a broken setup is caught early." },
  { icon: Flame, title: "Mailbox-level controls", text: "Start, pause or resume warmup per account, not across the whole workspace." },
];

const safetyDetails = [
  { title: "Bounce-rate protection", text: "Bounces are tracked per mailbox, and sending is held when the rate crosses the threshold for that account." },
  { title: "Complaint protection", text: "Spam complaints raise a safety condition immediately rather than being averaged away over time." },
  { title: "Health signals", text: "Health is shown on the mailbox so you can see a problem forming before it becomes a block." },
  { title: "Automatic pauses", text: "The mailbox stops sending by itself — you do not have to be watching the dashboard when something goes wrong." },
  { title: "Resume checks", text: "Resuming re-checks the condition first, so a mailbox is never quietly put back at risk." },
  { title: "Temporary capacity limits", text: "A full 12-hour window pauses that mailbox only, and the capacity returns as the window rolls forward." },
];

const audiences = [
  {
    icon: Globe,
    audience: "New domains",
    scenario: "A domain and mailbox set up last week with no sending history at all.",
    outcome: "Volume ramps in stages instead of starting at campaign scale.",
  },
  {
    icon: Users,
    audience: "Sales teams",
    scenario: "Reps need their sending accounts dependable, not blocked mid-quarter.",
    outcome: "Health and safety state are visible before volume is increased.",
  },
  {
    icon: Building2,
    audience: "Agencies with many accounts",
    scenario: "Dozens of mailboxes across several client domains to keep healthy.",
    outcome: "Per-mailbox stages, limits and controls in one warmup view.",
  },
];

const details = [
  { title: "Per-mailbox controls", text: "Start, pause and resume warmup on a single account without affecting the others." },
  { title: "Sending limits", text: "Each mailbox carries its own limit for the current rolling window, separate from campaign limits." },
  { title: "Warmup stages", text: "The ramp stage on each account shows how far into warmup it is." },
  { title: "Safety checks", text: "Bounce, complaint, authentication and health checks run continuously per mailbox." },
  { title: "Pause and resume behaviour", text: "Manual pauses clear on resume; active safety conditions are re-verified first." },
  { title: "Mailbox health visibility", text: "Health, status, stage and safety reason are shown on the same row." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach Warmup"
        title="Warm Up Your Mailboxes"
        highlight="Before You Scale."
        description="Build sending history gradually, watch mailbox health, and reduce the risk of damaging a new sending account before you start running serious outbound volume."
        benefits={["Gradual ramp", "Health monitoring", "Automatic safety pauses"]}
        primaryCta="Start Warming Up"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <Section
        muted
        title="New mailboxes cannot go from zero to hundreds of emails overnight."
        description="Most deliverability problems start in the first two weeks of a mailbox's life."
      >
        <PainPoints items={problems} />
      </Section>

      <BigPreview
        id="product"
        eyebrow="Inside warmup"
        title="Every sending account, with its health and limits"
        description="Status, volume, ramp stage and safety reason on one screen."
      >
        <WarmupDashboardMock />
      </BigPreview>

      <Section title="How a customer uses this screen">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <SafetySignalsMock />
          <WarmupScreenNotes items={screenNotes} />
        </div>
      </Section>

      <Section id="how-it-works" muted title="How warmup works">
        <RampSteps steps={steps} />
      </Section>

      <Section title="MunchReach warmup features">
        <FeatureGrid items={features} />
      </Section>

      <Section
        muted
        title="Your mailbox should slow down before a small problem becomes a big one."
        description="Warmup is not only about ramping up — it is about stopping early when a signal looks wrong."
      >
        <DetailPanel items={safetyDetails} />
        <div className="mt-10">
          <PauseVsBlock />
        </div>
        <RampNote>
          MunchReach manages sending behaviour and mailbox safety. No tool can guarantee inbox
          placement — that stays with the receiving provider.
        </RampNote>
      </Section>

      <Section
        title="Manage every sending account in one view"
        description="Mailbox, health, daily capacity, warmup stage, safety status and the action available on each account."
      >
        <MailboxManagementMock />
      </Section>

      <Section muted title="Before and after">
        <BeforeAfter
          beforeTitle="Without warmup"
          afterTitle="With MunchReach"
          before={[
            "New mailbox with no sending history",
            "Sudden jump to full campaign volume",
            "Sending reputation built on guesswork",
            "Problems found only after bounces pile up",
          ]}
          after={[
            "Gradual ramp through warmup stages",
            "Controlled volume per mailbox and window",
            "Health, bounces and complaints monitored",
            "Automatic safety pauses before it gets worse",
          ]}
        />
      </Section>

      <Section title="Who it's for">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section muted title="Details that matter">
        <DetailPanel items={details} />
      </Section>

      <TestimonialCarousel page="warmup" title="Deliverability, in their words" />

      <Section muted>
        <PageFaqs page="warmup" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Build mailbox health before you build sending volume."
        description="Connect a sending account, start warmup, and let MunchReach ramp volume while it watches the signals that matter."
        cta="Start Warmup"
      />
    </MarketingLayout>
  );
}
