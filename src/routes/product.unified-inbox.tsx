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
  History,
  AtSign,
  BellRing,
  ShieldCheck,
  KanbanSquare,
  MailSearch,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  DocSection,
  FeatureBento,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  BeforeAfter,
  UseCaseGrid,
  Section,
  Walkthrough,
  WorkflowStrip,
  metaFor,
  BigPreview,
} from "@/components/site/MarketingPage";
import { InboxPreview } from "@/components/site/InboxPreview";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Which mailboxes show up in the unified inbox?", a: "Every mailbox you connect for sending — IMAP, Gmail, Outlook or an API provider — feeds the same inbox automatically. Nothing needs to be added a second time." },
  { q: "Does a reply always go out from the mailbox that started the thread?", a: "Yes. MunchReach tracks which mailbox sent the original message and replies from that exact address, so the prospect's thread stays intact on their side too." },
  { q: "How does the inbox know a message belongs to an existing conversation?", a: "Threading is matched on the message headers and the original send record, not just subject line text, so forwarded or reformatted replies still land in the right thread." },
  { q: "Can I correct an AI label if it gets a reply wrong?", a: "Yes. Any label — interested, not interested, meeting request, out of office, wrong person, unsubscribe — can be changed manually, and you can add your own custom labels." },
  { q: "What happens to a sequence the moment someone replies?", a: "The sequence for that prospect stops immediately. No follow-up step can go out once a reply has been detected on the thread." },
  { q: "Can more than one teammate work the same inbox without duplicating replies?", a: "Yes. Assign a conversation to a single owner, @mention teammates for input, and see read state and activity so nobody answers a thread that's already been handled." },
  { q: "Can I snooze a conversation instead of closing it?", a: "Yes. Snoozing brings a thread back to the top of the inbox on a date you choose, which is useful for out-of-office replies or a prospect who asked you to circle back later." },
  { q: "Is there a record of what happened on a conversation over time?", a: "Every thread keeps a full history — sends, opens, clicks, replies, label changes, assignment changes and internal notes — in one scrollable timeline." },
  { q: "Can client viewers see the inbox?", a: "Yes, with read-only access scoped to their own campaigns and conversations, so agencies can share visibility without giving edit rights." },
  { q: "Does the inbox handle unsubscribe requests automatically?", a: "Yes. An unsubscribe reply is labelled, the prospect is suppressed workspace-wide, and no further email — from any campaign — will go to that address." },
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
  { icon: Inbox, title: "Replies scattered across mailboxes", text: "Running outreach from five or ten mailboxes means five or ten separate inboxes to check, and a warm reply can sit unread for a day in the wrong one." },
  { icon: Hourglass, title: "Slow response times cost meetings", text: "By the time someone finally opens the right mailbox, an interested prospect has gone quiet or replied to a competitor instead." },
  { icon: Split, title: "No shared context across the team", text: "A teammate replies to a prospect without knowing two other reps already spoke to them, and the thread turns into a mess to untangle." },
  { icon: MailWarning, title: "Signal buried in noise", text: "Bounces, out-of-office autoresponders and unsubscribes flood the same inbox as genuine interest, so real replies get missed in the scroll." },
];

const walkthroughSteps = [
  {
    title: "Email arrives on any connected mailbox",
    youDo: "Nothing — every mailbox you send from is already watched.",
    weHandle: "MunchReach picks up the incoming message the moment it lands, whether it came in through IMAP sync or a provider webhook.",
    youGet: "One inbox that captures replies from every mailbox without you checking each one.",
    visual: (
      <MockPanel title="Mailboxes syncing">
        <MockRows
          rows={[
            { left: "sam@munchreach-sales.com", muted: "IMAP · last synced 12s ago", badge: "Connected" },
            { left: "priya@munchreach-outbound.com", muted: "Gmail · last synced 8s ago", badge: "Connected" },
            { left: "hello@munchreach.io", muted: "API provider · webhook live", badge: "Connected" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "The message is matched to a thread",
    youDo: "Nothing — threading runs automatically on every incoming message.",
    weHandle: "The reply is matched to its original send record and grouped with every prior message in that conversation, even if the subject line was edited or the reply was forwarded.",
    youGet: "A single threaded conversation per prospect instead of disconnected one-off emails.",
    visual: (
      <MockPanel title="Thread — Re: Quick question about Fieldstack">
        <MockRows
          rows={[
            { left: "You — Mon 9:02am", muted: "Quick question about your onboarding flow..." },
            { left: "You — Thu 9:14am", muted: "Following up — happy to send a 2-min demo" },
            { left: "Marcus Lee — Tue 8:41am", muted: "Can we grab 15 min this week?", badge: "New" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "The conversation is labelled and assigned",
    youDo: "Set assignment rules once — by territory, campaign or round robin.",
    weHandle: "AI classifies the reply (interested, meeting request, out of office, not interested, wrong person, unsubscribe) and routes the thread to an owner based on your rules.",
    youGet: "Every conversation lands with the right person already tagged, without a manual triage pass.",
    visual: (
      <MockPanel title="Assign conversation">
        <MockRows
          rows={[
            { left: "Marcus Lee — Fieldstack Robotics", muted: "Labelled: Interested", right: "Priya N.", badge: "Assigned" },
            { left: "Aisha Toure — Northline Logistics", muted: "Labelled: Meeting request", right: "Sam K.", badge: "Assigned" },
            { left: "Devon Cross — Orbit Analytics", muted: "Labelled: Out of office", right: "Auto-snoozed", badge: "Snoozed" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "The owner replies from the original mailbox",
    youDo: "Write the reply, or use a saved reply template for common answers.",
    weHandle: "The reply is sent from the exact mailbox and thread the prospect originally emailed, so nothing looks disjointed on their end.",
    youGet: "A natural, in-thread conversation and a sequence that has already stopped for that prospect.",
    visual: (
      <MockPanel title="Reply — Marcus Lee">
        <MockRows
          rows={[
            { left: "Sequence stopped automatically", muted: "Triggered the instant the reply landed", badge: "Auto-stop" },
            { left: "Draft: \"Happy to — does Thursday 2pm work?\"", muted: "Sending from sam@munchreach-sales.com", badge: "Draft" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Follow-ups and reminders keep it moving",
    youDo: "Snooze a thread, or leave it — MunchReach reminds you.",
    weHandle: "If a prospect goes quiet after your reply, a follow-up reminder surfaces the thread again, and out-of-office replies auto-reschedule to the stated return date.",
    youGet: "No conversation quietly falls off your radar between the first reply and a booked meeting.",
    visual: (
      <MockPanel title="Follow-up reminders due today">
        <MockRows
          rows={[
            { left: "Aisha Toure — no response in 3 days", right: "Follow up now", badge: "Due" },
            { left: "Devon Cross — return date reached", right: "Re-surfaced", badge: "Snooze ended" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    title: "Team activity stays visible on every thread",
    youDo: "Add an internal note or @mention a teammate for a second opinion.",
    weHandle: "Every assignment change, note, label edit and reply is logged against the conversation, visible to the whole workspace.",
    youGet: "A clear audit trail so nobody duplicates work or replies to a prospect twice.",
    visual: (
      <MockPanel title="Activity — Aisha Toure">
        <MockRows
          rows={[
            { left: "Note added by Sam", muted: "\"Mentioned budget approved for Q2\"", badge: "Private" },
            { left: "@priya mentioned", muted: "\"Can you take this one, you know the account?\"", badge: "Mention" },
            { left: "Reassigned to Priya N.", muted: "By Sam · 2 minutes ago", badge: "Reassigned" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Inbox, title: "One shared inbox", text: "Threads from every connected mailbox, grouped by prospect and campaign, replace a folder-by-folder check." },
  { icon: Bot, title: "AI reply labels", text: "Interested, not interested, out of office, meeting request, wrong person and unsubscribe are applied the moment a reply lands." },
  { icon: History, title: "Mailbox-accurate threading", text: "Replies match to the exact original send, not just a subject string, so forwarded and reformatted replies still thread correctly." },
  { icon: Users, title: "Team assignment", text: "Route conversations to an owner by territory or round robin, and reassign a thread in one click without losing history." },
  { icon: AtSign, title: "@mentions on threads", text: "Bring a teammate into a conversation for a second opinion without forwarding an email out of the system." },
  { icon: StickyNote, title: "Internal notes", text: "Add private context the prospect never sees, visible to the whole workspace on that thread." },
  { icon: BellRing, title: "Follow-up reminders", text: "Threads that go quiet after your reply resurface automatically instead of relying on memory." },
  { icon: MailSearch, title: "Instant search", text: "Search subjects, bodies, prospects, companies and labels in milliseconds across every mailbox at once." },
  { icon: Zap, title: "Saved replies", text: "One-click templates for booking calls, answering pricing questions or sending a polite decline." },
  { icon: KanbanSquare, title: "Snooze and follow-up views", text: "Snooze a thread to a chosen date, or pull up a dedicated view of everything due for a follow-up." },
  { icon: ShieldCheck, title: "Unsubscribe suppression", text: "An unsubscribe reply suppresses the address workspace-wide so no other campaign can email it again." },
  { icon: Search, title: "Full conversation history", text: "Every send, open, click, reply, label change and note lives on one timeline per prospect." },
];

const workflowSteps = [
  { title: "Reply arrives", text: "A prospect replies to any campaign, on any connected mailbox." },
  { title: "Thread detected", text: "The message is matched to its original send and grouped into one conversation." },
  { title: "AI labels it", text: "Interested, meeting request, out of office or unsubscribe is applied instantly." },
  { title: "Sequence stops", text: "Any pending follow-up for that prospect is cancelled the moment the reply lands." },
  { title: "Conversation assigned", text: "The thread routes to an owner by rule, or stays with whoever already owns the account." },
  { title: "Reply is sent", text: "The owner replies, or a teammate is @mentioned first for input, from the original mailbox." },
  { title: "Follow-up tracked", text: "If the prospect goes quiet again, a reminder brings the thread back up." },
  { title: "History logged", text: "Every action is recorded on the thread for the next person who opens it." },
];

const useCases = [
  { icon: Inbox, audience: "Solo operators", scenario: "You run five or six mailboxes and check each one manually every morning before anything else gets done.", outcome: "One inbox, one pass through the morning, nothing missed in a forgotten mailbox." },
  { icon: Users, audience: "SDR teams", scenario: "Replies need to reach the right rep within minutes, not whenever someone happens to check the shared mailbox.", outcome: "Auto-assignment and labelling route the conversation before a human even opens it." },
  { icon: ShieldCheck, audience: "Agencies", scenario: "Client conversations must stay separated, auditable, and never cross-contaminate between accounts.", outcome: "Per-workspace inboxes with full history and optional read-only client access." },
  { icon: BellRing, audience: "Founders closing their own pipeline", scenario: "A meeting request comes in while you're heads-down on product, and it needs a same-day reply.", outcome: "Labelled and surfaced instantly, so a hot reply never sits behind cold noise." },
  { icon: KanbanSquare, audience: "RevOps and team leads", scenario: "You need visibility into who is replying to whom, and whether any conversation has stalled.", outcome: "Assignment, snooze state and follow-up reminders give a live view without extra reporting." },
  { icon: History, audience: "Teams with long sales cycles", scenario: "A prospect goes quiet for weeks, then comes back, and nobody remembers the earlier context.", outcome: "The full thread and notes are right there, so the reply picks up where it left off." },
];

const docGroups = [
  {
    title: "Conversations & threading",
    items: [
      "All replies from every connected mailbox in one shared inbox",
      "Threading matched on the original send record, not just subject text",
      "Forwarded and reformatted replies still group into the correct thread",
      "Full campaign and send history attached to each conversation",
    ],
  },
  {
    title: "Mailbox identification & reply handling",
    items: [
      "Every reply is tied back to the exact mailbox that started the thread",
      "Outgoing replies always send from that same mailbox and address",
      "AI classification: interested, not interested, meeting request, out of office, wrong person, unsubscribe",
      "Sequences stop the instant a reply is detected on a thread",
      "Saved reply templates for the most common responses",
    ],
  },
  {
    title: "Team workflow & history",
    items: [
      "Assignment by owner, territory or round robin, with one-click reassignment",
      "@mentions bring a teammate into a thread without leaving the inbox",
      "Internal notes visible to the workspace, never sent to the prospect",
      "Snooze and follow-up reminders keep quiet threads from being forgotten",
      "Full activity log: sends, opens, clicks, replies, labels, notes and assignment changes",
    ],
  },
];

const bullets = [
  "Threaded conversation view with the full campaign history attached",
  "Snooze, archive and follow-up reminders on every thread",
  "Unsubscribe handling and suppression applied workspace-wide in one click",
  "Attachment support and a signature configured per mailbox",
  "Keyboard shortcuts for triaging a high volume of replies quickly",
  "Per-role visibility so client viewers only see their own campaigns",
  "Editable AI labels plus support for custom labels you define",
  "Read state and assignment shown at a glance across the whole inbox",
  "Search across subjects, bodies, prospects, companies and labels",
  "Every reply and internal note timestamped on one conversation timeline",
];

const beforeAfter = {
  before: [
    "Replies scatter across four or five sending mailboxes",
    "Out-of-office and bounce noise buries real interest",
    "Two reps answer the same prospect twice",
    "A stalled conversation is forgotten until the prospect follows up first",
    "Nobody can tell who owns a given reply",
  ],
  after: [
    "Every mailbox lands in one threaded inbox with shared visibility",
    "Auto-classification separates interested replies from noise instantly",
    "Assignment, read state and notes keep the whole team in sync",
    "Follow-up reminders bring quiet threads back before they go cold",
    "Every conversation has a clear, visible owner",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Unified Inbox"
        title="Every reply from every mailbox,"
        highlight="threaded in one inbox"
        description="Stop checking mailboxes one by one. MunchReach pulls every reply into a single threaded inbox, labels it automatically, stops the sequence, and routes it to the right person on your team."
        benefits={[
          "Every mailbox in one threaded view",
          "AI labels and instant assignment",
          "Nothing falls through between replies",
        ]}
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="Unified inbox"
        title="Every reply, one threaded view"
        description="Multiple mailboxes, AI classification, assignment and internal notes in a single screen."
      >
        <InboxPreview className="rounded-none border-0" />
      </BigPreview>
      <Section title="Why replies get lost without one inbox">
        <PainPoints items={painPoints} />
      </Section>
      <Section
        id="how-it-works"
        title="From an incoming email to a booked meeting"
        description="What actually happens between a reply landing and a conversation moving forward."
      >
        <Walkthrough steps={walkthroughSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="The end-to-end reply workflow" description="How a single reply moves through MunchReach, start to finish.">
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually handle replies.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep capabilities" description="What's actually happening under the hood of the inbox.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch to a unified inbox.">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="unified-inbox" title="How teams work replies in MunchReach" />
      <Section muted>
        <PageFaqs page="unified-inbox" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Keep every conversation in one inbox"
        description="Connect your mailboxes once and let every reply, thread and follow-up live in a single place your whole team can work from."
      />
    </MarketingLayout>
  );
}
