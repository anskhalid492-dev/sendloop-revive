import { createFileRoute } from "@tanstack/react-router";
import { Gauge, Layers, ShieldCheck } from "lucide-react";

import {
  BeforeAfter,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  AccountsDashboardMock,
  ActionsPanelMock,
  CapacityMock,
  ConnectFlowMock,
  DomainGroupsMock,
  DomainReadinessMock,
  HealthMock,
  ReadinessNote,
  RecoveryFlow,
  SafetyMock,
  WarmupStatusMock,
} from "@/components/site/EmailAccountsProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";
import { AlertTriangle, Mailbox, SlidersHorizontal } from "lucide-react";

const faqs = [
  {
    q: "Which email accounts can I connect?",
    a: "You connect the sending accounts MunchReach supports for your workspace — a provider mailbox or your own sending account credentials. Each connected mailbox becomes its own account record with its own status, health, warmup state and sending capacity.",
  },
  {
    q: "How do I know if a mailbox is ready to send?",
    a: "The email accounts list shows status, health, warmup state and available capacity together. A mailbox is ready when it is connected, not paused, has no active safety block and still has capacity in the current sending window.",
  },
  {
    q: "How does mailbox capacity work?",
    a: "Each mailbox's sending is measured over a rolling 12-hour window rather than a fixed midnight reset, and only accepted sends count against it. When the window fills, that mailbox pauses sending until capacity frees up again — other available mailboxes keep sending.",
  },
  {
    q: "What happens when a mailbox is blocked?",
    a: "The mailbox is taken out of sending while the safety condition is active, and the reason is shown on the account. Resume cannot bypass a genuinely active block, but once the condition no longer applies the mailbox becomes resumable instead of staying permanently stuck.",
  },
  {
    q: "How does warmup relate to my email accounts?",
    a: "Warmup state — whether it is active, its stage and the mailbox health alongside it — is shown on the same account record you send from, so you can tell whether an account is still ramping or ready for campaign volume. Warmup activity is kept out of your campaign reporting.",
  },
  {
    q: "Can I use multiple sending accounts in a campaign?",
    a: "Yes. Assign several connected mailboxes to a campaign and sending is distributed across the accounts that are currently available, respecting each mailbox's own capacity and safety state. If one mailbox is full or paused, the others continue.",
  },
];

export const Route = createFileRoute("/product/email-accounts")({
  head: () =>
    metaFor(
      "Email Accounts — Connect & Manage Sending Mailboxes | MunchReach",
      "Connect your sending accounts, monitor mailbox health and warmup, track 12-hour sending capacity and manage domain readiness from one MunchReach workspace.",
      "/product/email-accounts",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: Mailbox,
    title: "Too Many Mailboxes",
    text: "Hard to know which accounts are ready to send.",
  },
  {
    icon: SlidersHorizontal,
    title: "Different Sending Limits",
    text: "Each mailbox can have different capacity and status.",
  },
  {
    icon: AlertTriangle,
    title: "Health Is Easy to Miss",
    text: "A mailbox can develop bounce or safety problems without obvious visibility.",
  },
];

const why = [
  {
    icon: Layers,
    title: "One Workspace",
    text: "Manage your sending accounts without jumping between tools.",
  },
  {
    icon: ShieldCheck,
    title: "Clear Mailbox Health",
    text: "See which accounts are ready, warming, paused, or blocked.",
  },
  {
    icon: Gauge,
    title: "Better Sending Control",
    text: "Understand mailbox capacity and status before launching campaigns.",
  },
];

const audiences = [
  {
    audience: "Sales Teams",
    scenario: "Several reps sending from a shared set of mailboxes.",
    outcome: "Manage the mailboxes used by your outbound team.",
  },
  {
    audience: "Agencies",
    scenario: "Separate sending accounts and domains per client.",
    outcome: "Keep client sending infrastructure organized inside the appropriate workspace.",
  },
  {
    audience: "Founders",
    scenario: "A handful of mailboxes tracked by hand today.",
    outcome: "Manage your outbound accounts without maintaining a complicated spreadsheet.",
  },
];

const steps = [
  { title: "Connect your mailbox", text: "Add a supported sending account to your workspace." },
  { title: "Verify sending setup", text: "Confirm the domain records and sending status." },
  { title: "Monitor health and capacity", text: "Watch status, warmup and the 12-hour window." },
  { title: "Use it in your campaigns", text: "Assign the mailbox to the campaigns that need it." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach Email Accounts"
        title="Manage Every Sending Mailbox"
        highlight="From One Place."
        description="Connect your sending accounts, monitor mailbox health, manage sending capacity, and keep your outbound infrastructure organized inside MunchReach."
        benefits={["Mailbox health", "12-hour capacity", "Warmup status", "Domain readiness"]}
        primaryCta="Connect an Email Account"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <Section
        id="product"
        title="See Your Entire Sending Infrastructure at a Glance"
        description="Instead of checking every inbox separately, manage your sending accounts from one workspace."
      >
        <AccountsDashboardMock />
      </Section>

      <Section
        muted
        title="Managing Multiple Mailboxes Gets Messy Fast."
        description="As outbound grows, domains, inboxes, sending limits, warmup and mailbox settings end up managed separately."
      >
        <PainPoints items={problems} />
      </Section>

      <Section
        title="Connect Your Sending Account"
        description="Connect a supported sending account and manage it from MunchReach once the connection is verified."
      >
        <ConnectFlowMock />
      </Section>

      <Section
        muted
        title="Know Which Mailboxes Are Healthy"
        description="Health, sending status, warmup, safety state and available capacity are shown on the same account record."
      >
        <HealthMock />
      </Section>

      <Section
        title="See Warmup Status Alongside Your Mailboxes"
        description="MunchReach keeps mailbox status and warmup state visible together so you can understand whether an account is ready to send."
      >
        <WarmupStatusMock />
      </Section>

      <Section
        muted
        title="Know How Much Each Mailbox Can Send"
        description="Mailbox capacity is managed separately from campaign limits, so you can understand whether a specific sending account is available."
      >
        <CapacityMock />
      </Section>

      <Section
        title="Scale Your Sending Infrastructure"
        description="Keep multiple sending accounts organized without switching between different tools."
      >
        <DomainGroupsMock />
      </Section>

      <Section
        muted
        title="Protect Mailboxes When Something Goes Wrong"
        description="Not every stop is the same — MunchReach separates active safety conditions from temporary capacity and manual pauses."
      >
        <SafetyMock />
      </Section>

      <Section
        title="Temporary Problems Don't Have to Become Permanent"
        description="Active safety violations stay blocked, while temporary conditions can clear once the underlying condition is resolved."
      >
        <RecoveryFlow />
      </Section>

      <Section
        muted
        title="Know When Your Domain Is Ready"
        description="Domain verification and sending readiness are different from simply adding an email account."
      >
        <DomainReadinessMock />
        <ReadinessNote />
      </Section>

      <Section
        title="Every Mailbox Control in One Panel"
        description="What each action on an email account actually does."
      >
        <ActionsPanelMock />
      </Section>

      <Section muted title="From Mailbox Chaos to One Sending Workspace">
        <BeforeAfter
          before={[
            "Multiple inboxes",
            "Separate warmup monitoring",
            "Unknown sending capacity",
            "Manual status checking",
            "Hard to see unhealthy accounts",
          ]}
          after={[
            "One mailbox dashboard",
            "Health visibility",
            "Capacity visibility",
            "Warmup status",
            "Clear mailbox controls",
          ]}
        />
      </Section>

      <Section id="how-it-works" title="How It Works">
        <WorkflowStrip steps={steps} />
      </Section>

      <Section muted title="Why MunchReach Email Accounts">
        <FeatureGrid items={why} />
      </Section>

      <Section title="Who It's For">
        <UseCaseGrid items={audiences} />
      </Section>

      <TestimonialCarousel page="email-accounts" title="Sending health, in their words" />

      <Section muted>
        <PageFaqs page="email-accounts" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Get Your Sending Accounts Under Control."
        description="Connect your mailboxes, monitor their health, and manage your outbound sending infrastructure from MunchReach."
        cta="Connect an Email Account"
      />
    </MarketingLayout>
  );
}
