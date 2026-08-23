import { createFileRoute } from "@tanstack/react-router";
import {
  Inbox,
  Bot,
  Users,
  StickyNote,
  Search,
  Zap,
  MailWarning,
  Split,
  Hourglass,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  BeforeAfter,
  UseCaseGrid,
  Section,
  SolutionSplit,
  StatStrip,
  StepList,
  metaFor,
  BigPreview,
  FeatureBento,
} from "@/components/site/MarketingPage";
import { InboxPreview } from "@/components/site/InboxPreview";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Which mailboxes are supported?", a: "Any IMAP mailbox plus Gmail and Outlook, alongside API providers used for sending." },
  { q: "Does replying use the original mailbox?", a: "Yes. Replies always go out from the mailbox that started the conversation to keep threading intact." },
  { q: "Are AI labels editable?", a: "Yes. You can correct a label at any time and create your own custom labels." },
  { q: "Can clients see the inbox?", a: "Client viewers can be given read-only access scoped to their campaigns." },
  { q: "What happens when a sequence gets a reply?", a: "The sequence stops the moment the reply lands, so no follow-up ever crosses with a live conversation." },
  { q: "Can multiple reps work the same inbox?", a: "Yes. Assign threads to an owner, @mention teammates, and see a full audit trail of who did what." },
];

export const Route = createFileRoute("/product/unified-inbox")({
  head: () =>
    metaFor(
      "Unified Inbox for Cold Email Replies | MunchReach",
      "Manage prospect replies, conversations, and follow-ups from one unified inbox built for modern cold email outreach.",
      "/product/unified-inbox",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: Inbox, title: "Replies scattered everywhere", text: "Ten mailboxes means ten separate inboxes to babysit, and warm replies get buried under bounces." },
  { icon: Hourglass, title: "Slow response times", text: "By the time someone checks the right mailbox, an interested prospect has already gone quiet." },
  { icon: Split, title: "No shared context", text: "A teammate replies without knowing three other people already talked to the same prospect." },
];

const solutionRows = [
  {
    eyebrow: "One shared inbox",
    title: "Every conversation, in a single threaded view",
    text: "All replies from every connected mailbox land in one place, grouped by prospect with the full campaign history attached.",
    bullets: [
      "Threaded view across every mailbox and step",
      "Full send history alongside the conversation",
      "Search across subjects, bodies and companies",
    ],
    visual: (
      <MockPanel title="Inbox — Interested (4)">
        <MockRows
          rows={[
            { left: "Marcus Lee — Fieldstack Robotics", muted: "\"Can we grab 15 min this week?\"", badge: "Interested", right: "2m ago" },
            { left: "Aisha Toure — Northline Logistics", muted: "\"Send over the case study please\"", badge: "Interested", right: "18m ago" },
            { left: "Devon Cross — Orbit Analytics", muted: "\"Out of office until the 14th\"", badge: "OOO", right: "1h ago" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "AI triage",
    title: "Replies sort themselves before you even open them",
    text: "Every incoming message is classified instantly — interested, not interested, meeting request, out of office, wrong person or unsubscribe — and the sequence stops on the spot.",
    visual: (
      <MockPanel title="Thread — Aisha Toure">
        <MockRows
          rows={[
            { left: "Sequence stopped automatically", muted: "Triggered by reply detection", badge: "Auto-stop" },
            { left: "AI label applied", muted: "Classified in 0.4s", badge: "Interested" },
            { left: "Internal note added", muted: "\"Mentioned budget approved for Q2\" — Sam", badge: "Private" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Team assignment",
    title: "The right person replies, every time",
    text: "Route conversations to an owner based on territory or round robin, mention teammates for a second opinion, and keep a clean audit trail without leaving the thread.",
    visual: (
      <MockPanel title="Assign conversation">
        <MockRows
          rows={[
            { left: "Marcus Lee — Fieldstack Robotics", muted: "Assigned to", right: "Priya N.", badge: "Owner" },
            { left: "Aisha Toure — Northline Logistics", muted: "Mentioned", right: "@sam", badge: "Review" },
            { left: "Devon Cross — Orbit Analytics", muted: "Snoozed until return date", badge: "Snoozed" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Inbox, title: "One shared inbox", text: "Threads from every connected mailbox, grouped by prospect and campaign." },
  { icon: Bot, title: "AI reply labels", text: "Interested, not interested, out of office, meeting request, wrong person and unsubscribe — labelled automatically." },
  { icon: Users, title: "Team assignment", text: "Route conversations to an owner, mention teammates and keep an audit trail of every action." },
  { icon: StickyNote, title: "Internal notes", text: "Add private context that never reaches the prospect, visible to the whole workspace." },
  { icon: Search, title: "Instant search", text: "Search across subjects, bodies, prospects, companies and labels in milliseconds." },
  { icon: Zap, title: "Saved replies", text: "One-click templates for booking calls, pricing questions and polite opt-outs." },
];

const steps = [
  { title: "Connect mailboxes", text: "Add IMAP or API mailboxes and replies sync automatically." },
  { title: "Let AI triage", text: "Every reply is classified and the sequence stops instantly." },
  { title: "Assign and respond", text: "Owners reply from the original mailbox with saved replies or a fresh message." },
  { title: "Move the deal forward", text: "Update CRM stage, book a meeting or push the lead to your pipeline." },
];

const bullets = [
  "Threaded conversation view with full campaign history",
  "Snooze, archive and follow-up reminders",
  "Unsubscribe handling and suppression in one click",
  "Attachment support and signature per mailbox",
  "Keyboard shortcuts for high-volume triage",
  "Per-role visibility for client viewers",
];

const beforeAfter = {
  before: [
  "Replies scatter across four or five sending mailboxes",
  "Out-of-office and bounce noise buries real interest",
  "Two reps answer the same prospect twice"
],
  after: [
  "Every mailbox in one threaded inbox with shared visibility",
  "Auto-classification separates interested from noise",
  "Assignment, read state and notes keep the team in sync"
],
};

const useCases = [
  {
    "audience": "Solo operators",
    "scenario": "You run six mailboxes and check each one manually every morning.",
    "outcome": "One inbox, one pass, nothing missed."
  },
  {
    "audience": "SDR teams",
    "scenario": "Replies need routing to the right owner within minutes.",
    "outcome": "Auto-assignment plus real-time reply alerts."
  },
  {
    "audience": "Agencies",
    "scenario": "Client threads must stay separated and auditable.",
    "outcome": "Per-workspace inboxes with full history."
  }
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Unified Inbox"
        title="Every reply from every mailbox,"
        highlight="in one place"
        description="Stop switching between mailboxes. MunchReach pulls replies from all connected accounts into a shared inbox with AI labels, assignment and full prospect history."
        secondaryCta="Explore Unified Inbox"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Unified inbox"
        title="Every reply in one place"
        description="Multiple mailboxes, AI classification, assignment and notes in a single view."
      >
        <InboxPreview className="rounded-none border-0" />
      </BigPreview>
      <Section title="Why replies get lost">
        <PainPoints items={painPoints} />
      </Section>
      <Section title="How MunchReach solves it" description="A single inbox that thinks and triages for you.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
        <div className="mt-12">
          <StepList steps={steps} />
        </div>
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <TestimonialCarousel page="unified-inbox" title="How teams work replies in MunchReach" />
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section>
        <StatStrip
          stats={[
            { value: "<1min", label: "Average time to sequence auto-stop on reply" },
            { value: "6", label: "AI reply labels applied automatically" },
            { value: "40%", label: "Faster response time reported by teams" },
            { value: "0", label: "Missed replies across mailboxes" },
          ]}
        />
      </Section>
      <Section muted>
        <PageFaqs page="unified-inbox" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Bring every reply into one inbox"
        description="Connect your mailboxes and never lose a warm lead in a crowded inbox again."
      />
    </MarketingLayout>
  );
}
