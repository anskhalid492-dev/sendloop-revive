import { createFileRoute } from "@tanstack/react-router";
import {
  AtSign,
  Clock,
  Inbox,
  Layers,
  Mail,
  MessageSquare,
  Search,
  StickyNote,
  Tag,
  UserCheck,
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
  SolutionSplit,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  ComposerMock,
  MailboxRollupMock,
  ReplyFlow,
  RoutingMock,
  ThreadHistoryMock,
  UniboxMock,
} from "@/components/site/UniboxProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "Which mailboxes appear in UniBox?",
    a: "Every sending account you connect to the workspace. Once a mailbox is connected for sending, its replies flow into UniBox automatically — you do not add it a second time.",
  },
  {
    q: "Does a reply go out from the mailbox that sent the original email?",
    a: "Yes. Each conversation records the sending account it started from, and the composer sends from that same address so the prospect sees one continuous thread.",
  },
  {
    q: "How are replies grouped into conversations?",
    a: "Incoming messages are matched back to the original send record and grouped with the earlier messages on that thread, so the whole exchange stays together instead of arriving as separate emails.",
  },
  {
    q: "Can two teammates work the same inbox without replying twice?",
    a: "Assign a conversation to one owner and everyone can see who has it. Internal notes and activity on the thread show what has already been said before anyone replies.",
  },
  {
    q: "What is the difference between snooze and archive?",
    a: "Snooze hides a conversation until a date you choose and then brings it back to the top of the inbox. Archive removes it from the active list once it is finished, and it stays searchable.",
  },
  {
    q: "Are internal notes ever sent to the prospect?",
    a: "No. Notes are visible only to your workspace and live on the conversation timeline alongside the emails, so context stays with the thread.",
  },
];

export const Route = createFileRoute("/product/unified-inbox")({
  head: () =>
    metaFor(
      "UniBox — Every Reply From Every Mailbox in One Inbox | MunchReach",
      "UniBox brings replies from all your sending accounts into one threaded workspace with lead context, assignments, tags, snooze and internal notes.",
      "/product/unified-inbox",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: Inbox,
    title: "Replies live in 17 places",
    text: "Every sending account has its own inbox, so warm replies sit unread in a mailbox nobody checked today.",
  },
  {
    icon: Clock,
    title: "Follow-ups get forgotten",
    text: "A prospect asks for pricing on Tuesday, and nobody notices until they have already moved on.",
  },
  {
    icon: Users,
    title: "Nobody knows who owns what",
    text: "Managers cannot see which conversations still need a response, or which mailbox the original email came from.",
  },
];

const showcaseNotes = [
  { n: 1, text: "Mailbox sidebar — every connected sending account, with open counts." },
  { n: 2, text: "Conversation list showing the prospect, company, snippet and source mailbox." },
  { n: 3, text: "Threaded view with each send, follow-up and reply in order." },
  { n: 4, text: "Lead panel: campaign, sending account, sequence state, stage and owner." },
  { n: 5, text: "Composer that replies from the original sending account." },
  { n: 6, text: "Assign, tag, snooze, archive and internal notes on every thread." },
];

const solutions = [
  {
    eyebrow: "A. One inbox for every mailbox",
    title: "Stop opening mailboxes one at a time",
    text: "Connect five mailboxes or fifty — replies land in a single list. Filter by sending account when you need to, or work everything in one pass in the morning.",
    bullets: [
      "Each conversation shows which sending account it belongs to",
      "Filter by mailbox, or view all conversations together",
      "Open counts per mailbox so nothing is hidden behind a filter",
    ],
    visual: <MailboxRollupMock />,
  },
  {
    eyebrow: "B. Full conversation history",
    title: "See everything that happened before you reply",
    text: "Every step sent, the follow-ups, the reply and the internal notes sit on one timeline, so you know exactly what the prospect has already received.",
    bullets: [
      "Original send, follow-up steps and the reply in one thread",
      "Sequence state shown on the conversation",
      "Notes and assignment changes recorded with the emails",
    ],
    visual: <ThreadHistoryMock />,
  },
  {
    eyebrow: "C. Respond without leaving the workspace",
    title: "Reply from the right address, in the right thread",
    text: "Write the reply in UniBox and it goes out from the sending account that started the conversation. No copying text into Gmail and hoping the thread matches.",
    bullets: [
      "From-address locked to the original sending account",
      "Snooze, archive, tag or assign directly from the composer",
      "Attachments and internal notes handled in the same view",
    ],
    visual: <ComposerMock />,
  },
  {
    eyebrow: "D. Route and organize replies",
    title: "Give every conversation an owner",
    text: "Assign a thread to a teammate, tag it so it is easy to find later, and snooze the out-of-office replies until the date they said they are back.",
    bullets: [
      "Assign or reassign a conversation in one click",
      "Tags for interest, pricing, wrong person or anything you define",
      "Snoozed threads come back to the top on the chosen date",
    ],
    visual: <RoutingMock />,
  },
];

const features = [
  { icon: MessageSquare, title: "Unified conversations", text: "Every reply from every sending account in one list." },
  { icon: Mail, title: "Multi-mailbox management", text: "Filter by mailbox or work all accounts at once." },
  { icon: Layers, title: "Threaded replies", text: "Sends, follow-ups and replies grouped per prospect." },
  { icon: UserCheck, title: "Lead context", text: "Campaign, sending account, stage and owner beside the thread." },
  { icon: Users, title: "Assign conversations", text: "Give a thread a single owner so nobody doubles up." },
  { icon: Tag, title: "Tags and organization", text: "Label threads by intent and filter them later." },
  { icon: Clock, title: "Snooze and follow-up", text: "Hide a thread until the date you want it back." },
  { icon: StickyNote, title: "Internal notes", text: "Private context on the thread, never sent to the prospect." },
];

const flowSteps = [
  "Campaign sends email",
  "Prospect replies",
  "Reply appears in UniBox",
  "Lead context is shown",
  "Team member responds",
  "Conversation is assigned",
  "Lead moves forward",
];

const audiences = [
  {
    icon: Layers,
    audience: "Agencies managing multiple clients",
    scenario: "Each client has its own domains and mailboxes to keep separate.",
    outcome: "One inbox per workspace, with the sending account visible on every reply.",
  },
  {
    icon: Users,
    audience: "Sales teams running outbound",
    scenario: "Replies need to reach the right rep the same morning they arrive.",
    outcome: "Assignment and tags make ownership obvious at a glance.",
  },
  {
    icon: Inbox,
    audience: "Founders managing outreach themselves",
    scenario: "You send from a few mailboxes and check them between other work.",
    outcome: "One pass through UniBox instead of hopping between inboxes.",
  },
];

const details = [
  { icon: Search, title: "Search across mailboxes", text: "Find a person, company or phrase without knowing which account it came from." },
  { icon: AtSign, title: "Bring in a teammate", text: "Pull someone into a thread when the answer is not yours to give." },
  { icon: Clock, title: "Snooze with a return date", text: "Out-of-office replies come back when the prospect is actually back." },
  { icon: Tag, title: "Filters that stick", text: "Save the view you triage from — unassigned, needs reply, or a single mailbox." },
  { icon: StickyNote, title: "Context stays on the thread", text: "The next person to open it sees the notes, not a blank slate." },
  { icon: Mail, title: "Correct sending account", text: "Replies always leave from the address the prospect already knows." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach UniBox"
        title="Every Reply. Every Mailbox."
        highlight="One Inbox."
        description="Stop switching between mailboxes to manage replies. UniBox brings conversations from all your sending accounts into one clean workspace so your team can respond faster and never miss a lead."
        benefits={["All mailboxes in one list", "Threaded conversations", "Assignments and notes"]}
        primaryCta="Start Free"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <Section
        muted
        title="Your replies shouldn't be scattered across 17 inboxes"
        description="When outbound runs from many sending accounts, the replies are the first thing to get lost."
      >
        <PainPoints items={problems} />
      </Section>

      <BigPreview
        id="product"
        eyebrow="Inside UniBox"
        title="What you actually see when a reply lands"
        description="Mailboxes on the left, conversations in the middle, lead context on the right."
      >
        <UniboxMock />
      </BigPreview>

      <Section title="What's on the screen">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {showcaseNotes.map((c) => (
            <li
              key={c.n}
              className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/60 p-4"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                {c.n}
              </span>
              <span className="text-sm text-muted-foreground">{c.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="how-it-works"
        muted
        title="How MunchReach solves it"
        description="Four things UniBox changes about the way replies get handled."
      >
        <SolutionSplit rows={solutions} />
      </Section>

      <Section title="What you can do in UniBox">
        <FeatureGrid items={features} />
      </Section>

      <Section
        muted
        title="The real outbound workflow"
        description="From the moment a campaign email goes out to the moment the lead moves forward."
      >
        <ReplyFlow steps={flowSteps} />
      </Section>

      <Section title="Before and after">
        <BeforeAfter
          beforeTitle="Without UniBox"
          afterTitle="With UniBox"
          before={[
            "Log into each mailbox to look for replies",
            "Interested replies sit unread for a day",
            "Two reps answer the same prospect",
            "No record of what was already promised",
            "Managers ask in Slack who is handling a lead",
          ]}
          after={[
            "Every sending account feeds one list",
            "Replies surface the moment they arrive",
            "One owner per conversation, visible to all",
            "Full thread history and internal notes attached",
            "Assignment and tags answer the question on the screen",
          ]}
        />
      </Section>

      <Section muted title="Who it's for">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section title="Details that matter">
        <FeatureGrid items={details} />
      </Section>

      <TestimonialCarousel page="unified-inbox" title="How teams work replies in MunchReach" />

      <Section muted>
        <PageFaqs page="unified-inbox" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Stop hunting for replies. Start working the conversations."
        description="Connect your sending accounts once and let every reply, thread and follow-up live in one place your whole team can work from."
        cta="Start Free"
      />
    </MarketingLayout>
  );
}
