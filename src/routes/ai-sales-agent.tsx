import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  BrainCircuit,
  GitBranch,
  Gauge,
  Handshake,
  Inbox,
  KeyRound,
  ListChecks,
  MessageSquareReply,
  MessagesSquare,
  PencilLine,
  Route as RouteIcon,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Workflow,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  Section,
  UseCaseGrid,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What is the AI Sales Agent?",
    a: "An AI step inside MunchReach workflows. It reads a prospect's latest message and the available conversation context, works out their intent against the outcomes you configure, and then drafts a reply, routes the lead down the matching workflow path or requests human review.",
  },
  {
    q: "Does the AI Sales Agent need my own AI API key?",
    a: "No. The AI Sales Agent runs on an AI provider supplied and configured by MunchReach. You don't need to connect your own AI key for it.",
  },
  {
    q: "Can I control what the AI says?",
    a: "Yes. In the AI Sales Agent settings you describe what you sell, who you serve, your tone and the facts the AI is allowed to use. Replies are based on those instructions and the conversation — if information isn't provided, the AI shouldn't make it up.",
  },
  {
    q: "Can I require human approval?",
    a: "Yes. Replies are saved as drafts by default, and you can add a Human Review step to any workflow so a person approves or takes over the conversation.",
  },
  {
    q: "Can AI automatically send replies?",
    a: "Only if you explicitly turn on auto-send for that step. Even then, a reply is sent only when every safety check passes — otherwise it stays a draft or goes to human review.",
  },
  {
    q: "What happens when AI is unsure?",
    a: "If confidence is below your threshold, or the decision fails or is unclear, the AI doesn't act on its own. The lead follows your fallback path, and replies stay as drafts for a person to check.",
  },
  {
    q: "Can AI handle unsubscribe requests?",
    a: "Unsubscribe requests are a protected situation. The AI does not auto-send a reply to them; they are kept as drafts or routed for human handling.",
  },
  {
    q: "Does AI Sales Agent work with MunchReach workflows?",
    a: "Yes — that's where it lives. Add an AI Decision, Generate AI Reply or Human Review step to a workflow in Automations, and branch the rest of the workflow on what the AI decides.",
  },
];

const howItWorks = [
  {
    title: "Reads the conversation",
    text: "AI understands the prospect's latest message and the available conversation context.",
  },
  {
    title: "Understands intent",
    text: "AI classifies the lead using the outcomes you configured and your confidence threshold.",
  },
  {
    title: "Takes the right action",
    text: "Depending on your workflow, AI can draft a reply, route the lead, continue the workflow or request human review.",
  },
  {
    title: "Keeps humans in control",
    text: "Low-confidence, sensitive, pricing, discount, legal, unsubscribe and other protected situations can go to a person instead of being sent automatically.",
  },
];

const features = [
  { icon: Target, title: "AI lead qualification", text: "Understand buyer intent from the conversation, not just keywords." },
  { icon: PencilLine, title: "AI reply generation", text: "Generate contextual sales replies based on your own instructions." },
  { icon: UserCheck, title: "Human handoff", text: "Route conversations to a person whenever AI shouldn't handle them." },
  { icon: ListChecks, title: "Custom sales instructions", text: "Tell the AI what you sell, who you serve and which facts it can use." },
  { icon: ShieldCheck, title: "Safety rules", text: "Prevent unsafe automatic responses in protected situations." },
  { icon: Workflow, title: "Workflow automation", text: "Connect AI decisions to your existing MunchReach workflows." },
  { icon: Gauge, title: "Confidence-based decisions", text: "Set a confidence threshold the AI must meet before taking automated actions." },
  { icon: Send, title: "Draft or auto-send", text: "Keep AI replies as drafts, or allow auto-send when every safety requirement is met." },
];

const useCases = [
  { icon: Target, audience: "Lead qualification", scenario: "Sort replies into the outcomes you define, such as interested, not now or not a fit.", outcome: "Focus on real interest" },
  { icon: MessageSquareReply, audience: "Reply handling", scenario: "Draft answers to common questions using the facts you've approved.", outcome: "Less repetitive typing" },
  { icon: MessagesSquare, audience: "Objection handling", scenario: "Recognise common objections and draft a response in line with your instructions.", outcome: "Consistent answers" },
  { icon: Handshake, audience: "Sales handoff", scenario: "Send interested or complex conversations to a person through Human Review.", outcome: "Humans close the deal" },
  { icon: RouteIcon, audience: "Inbound lead routing", scenario: "Branch workflows on what the prospect actually asked for.", outcome: "Right path, every lead" },
  { icon: GitBranch, audience: "Conversation follow-up", scenario: "Continue the configured workflow once the AI has made its decision.", outcome: "No reply left hanging" },
];

const protectedCases = [
  "Unsubscribe requests",
  "Low-confidence decisions",
  "Legal or sensitive topics",
  "Pricing or discount requests when the information isn't approved",
  "Missing conversation context",
  "AI or provider failures",
  "Requests to speak with a human",
];

const problems = [
  "Replies get missed when the team is busy.",
  "Important leads get buried in crowded inboxes.",
  "The same questions take time to answer again and again.",
  "Follow-ups happen at different times — or not at all.",
  "Reps spend hours reading conversations instead of working real opportunities.",
];

function FlowNode({ icon: Icon, label, sub, accent }: { icon: typeof Inbox; label: string; sub: string; accent?: boolean }) {
  return (
    <div
      className={
        "flex w-full items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4 " +
        (accent ? "border-primary/40 ring-1 ring-primary/20" : "border-border")
      }
    >
      <span className={"flex size-9 shrink-0 items-center justify-center rounded-xl " + (accent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function Arrow() {
  return <ArrowDown className="mx-auto my-1.5 size-4 text-primary/60" aria-hidden />;
}

function HeroVisual() {
  return (
    <div className="surface-card mx-auto max-w-xl p-4 sm:p-6" aria-label="Example AI Sales Agent workflow">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Workflow preview</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Sparkles className="size-3" /> AI Sales Agent
        </span>
      </div>
      <FlowNode icon={Inbox} label="Lead reply" sub="“Can you send me more information?”" />
      <Arrow />
      <FlowNode icon={BrainCircuit} label="AI understands intent" sub="Reads the message and conversation context" />
      <Arrow />
      <FlowNode icon={GitBranch} label="AI Decision" sub="Matches a configured outcome above your threshold" accent />
      <Arrow />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FlowNode icon={PencilLine} label="Draft reply" sub="Saved for review" />
        <FlowNode icon={UserCheck} label="Human review" sub="Protected or unsure" />
      </div>
      <Arrow />
      <FlowNode icon={Handshake} label="Sales team" sub="Picks up the opportunity" />
    </div>
  );
}

export const Route = createFileRoute("/ai-sales-agent")({
  head: () =>
    metaFor(
      "AI Sales Agent for Automated Sales Conversations | MunchReach",
      "MunchReach AI Sales Agent helps teams qualify leads, understand sales conversations, draft replies, automate workflows, and route important conversations to humans.",
      "/ai-sales-agent",
      faqs,
    ),
  component: Page,
});

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="AI Sales Agent"
        title="AI Sales Agent That Handles Your Leads Like a Sales Rep"
        description="Let AI read your sales conversations, understand buyer intent, handle common replies, draft responses, and hand qualified opportunities to your team — automatically."
        benefits={["Drafts by default — you stay in control", "No AI API key needed", "Works inside your MunchReach workflows"]}
        primaryCta="Start Free"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      >
        <HeroVisual />
      </PageHero>

      <Section
        title="Your Leads Are Replying. Your Team Can't Answer Every One."
        description="Outreach works — and then the replies pile up. An AI sales assistant takes care of the reading and sorting so your team can spend time where it counts."
      >
        <div className="mx-auto max-w-3xl">
          <BulletList items={problems} />
        </div>
      </Section>

      <Section muted id="how-it-works" title="How AI Sales Agent works" description="Four steps from a new reply to the right next action.">
        <WorkflowStrip steps={howItWorks} />
      </Section>

      <Section title="AI sales automation, built for real conversations" description="Everything the AI Sales Agent does, with your rules in charge.">
        <FeatureGrid items={features} />
      </Section>

      <Section muted title="See it in action" description="A generic example — the AI's response always depends on your configured instructions and the conversation context available.">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
          {[
            { k: "Prospect", v: "“Can you send me more information about your product?”" },
            { k: "AI understands", v: "Intent: wants more information. Confidence meets your threshold, so the configured path is chosen." },
            { k: "AI action", v: "Drafts a reply using only the product facts you approved, ready for review or — if enabled and safe — sending." },
          ].map((c) => (
            <div key={c.k} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">{c.k}</p>
              <p className="mt-2 text-sm text-muted-foreground">{c.v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="AI That Knows When to Step Back"
        description="The AI Sales Agent is designed not to send replies blindly. In protected situations, replies stay as drafts or go to human review. No AI is perfect — that's why these checks exist."
      >
        <div className="mx-auto max-w-3xl">
          <BulletList items={protectedCases} />
        </div>
      </Section>

      <Section muted title="No AI key to manage" description="AI Sales Agent runs on an AI provider supplied and configured by MunchReach. You don't need to bring your own AI API key — just set your instructions and add it to a workflow.">
        <FeatureGrid
          items={[
            { icon: KeyRound, title: "Provided by MunchReach", text: "The AI provider is set up and managed by the MunchReach team." },
            { icon: ShieldCheck, title: "Nothing to configure", text: "No customer API key is needed for the AI Sales Agent." },
            { icon: ListChecks, title: "Your instructions", text: "You decide what the AI knows about your business and how it should sound." },
          ]}
        />
      </Section>

      <Section title="Works With Your Existing Automations" description="Add AI steps to the workflows you already use in MunchReach. In plain terms, the AI Sales Agent can:">
        <div className="mx-auto max-w-3xl">
          <BulletList
            items={[
              "Classify replies into the outcomes you choose",
              "Branch the workflow based on intent",
              "Generate replies from your instructions",
              "Request human review",
              "Move leads through your configured workflow",
              "Continue the rest of your automated process",
            ]}
          />
        </div>
      </Section>

      <Section muted title="Use cases for automated lead qualification and replies">
        <UseCaseGrid items={useCases} />
      </Section>

      <PageFaqs page="/ai-sales-agent" defaults={faqs} />

      <CtaBlock
        title="Turn More Conversations Into Sales Opportunities"
        description="Let AI handle the repetitive parts of sales conversations while your team focuses on the opportunities that need a human touch."
        cta="Start Free"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
    </MarketingLayout>
  );
}
