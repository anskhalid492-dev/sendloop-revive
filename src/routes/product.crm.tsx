import { createFileRoute } from "@tanstack/react-router";
import {
  Kanban,
  UserCheck,
  History,
  Tags,
  ListTodo,
  StickyNote,
  Filter,
  Users,
  Inbox,
  ArrowRightLeft,
  MousePointerClick,
  ClipboardList,
  AlertTriangle,
  FileSpreadsheet,
  GitBranch,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  BeforeAfter,
  UseCaseGrid,
  Section,
  DocSection,
  metaFor,
  BigPreview,
  FeatureBento,
  WorkflowStrip,
  Walkthrough,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Does this replace Salesforce or HubSpot?", a: "For most outbound-led teams, yes — the CRM covers pipeline, activity, tasks and notes end to end. If you already run a CRM for closed-won accounting, keep using it alongside this one for the outbound stage of the funnel." },
  { q: "Can I customize stages?", a: "Yes. Every workspace defines its own stages and colors, from New Lead through Meeting Booked, Proposal Sent, Won and Lost — add, rename or remove stages as your process changes." },
  { q: "How does a contact end up in the pipeline?", a: "Automatically from a reply on a campaign, or manually by adding a contact yourself with an email, name and company. Either way it lands on a stage with full context attached." },
  { q: "Is activity history kept after a campaign ends?", a: "Yes. The full send, open, click and reply history stays on the contact record permanently, even after the sequence that generated it has finished." },
  { q: "Can I filter and sort the pipeline?", a: "Yes — search by name or email, filter by tag or lead source, and sort by recent activity, date added, last reply or next task due." },
  { q: "How do tasks and reminders work?", a: "Add a task with a title and due date to any contact. Mark it done from the contact drawer, and overdue tasks stay visible until they're resolved." },
  { q: "Can I move several contacts between stages at once?", a: "Yes, select multiple contacts in the pipeline and bulk-move them to a new stage in one action." },
  { q: "Do notes and activity update live for the whole team?", a: "Yes. The pipeline updates in real time, so when a teammate adds a note, moves a card or logs a reply, everyone viewing the board sees it immediately." },
  { q: "What's tracked on a single contact?", a: "Stage, lead source, tags, every campaign touch (sent, opened, clicked, replied), every note added by a teammate, and every task with its due date and completion state." },
];

export const Route = createFileRoute("/product/crm")({
  head: () => metaFor(
    "CRM for Cold Email & Sales Outreach | MunchReach",
    "A live sales pipeline built for outbound: contacts, stages, activity history, tasks and notes wired directly to your campaigns and inbox.",
    "/product/crm",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: AlertTriangle, title: "Replies fall through the cracks", text: "A prospect says \"interested\" and nobody follows up because it never becomes a card." },
  { icon: FileSpreadsheet, title: "Spreadsheets pretending to be a CRM", text: "Trackers overlap, stages mean different things, and nobody knows the real pipeline." },
  { icon: GitBranch, title: "Context lives in three tools", text: "Email history, notes and deal stage are scattered across separate tools." },
];

const walkSteps = [
  {
    title: "A lead comes in",
    youDo: "Run a cold email campaign, or add a contact manually with their email, name and company.",
    weHandle: "New contacts land on the pipeline's first stage automatically, tagged with their lead source.",
    youGet: "Every prospect you're working, in one list, instead of scattered across a sender tool and a spreadsheet.",
    visual: (
      <MockPanel title="New contact — Add to pipeline">
        <MockRows rows={[
          { left: "dana@northwind.io", muted: "Northwind Logistics", right: "Cold Email Q3" },
          { left: "Lead source", right: "Campaign reply" },
          { left: "Stage", right: "New Lead", badge: "Auto" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "The contact becomes a pipeline card",
    youDo: "Nothing — a positive reply detected on any campaign creates or advances the contact's card without an import step.",
    weHandle: "The card carries the campaign, mailbox and thread that produced it, plus tags and lead source.",
    youGet: "A pipeline that reflects reality because it's built from what actually happened in outreach.",
    visual: (
      <MockPanel title="Pipeline — Outbound Q3">
        <MockRows rows={[
          { left: "New Lead", right: "42 contacts", muted: "Auto-added from campaigns" },
          { left: "Meeting Booked", right: "11 contacts", badge: "Hot" },
          { left: "Proposal Sent", right: "6 contacts" },
          { left: "Won", right: "4 contacts", badge: "Closed" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Every activity attaches to the contact",
    youDo: "Keep sending your sequence — nothing extra to log.",
    weHandle: "Sends, opens, clicks and replies from campaigns are recorded on the contact's timeline the moment they happen.",
    youGet: "A single scrollable history for each contact, so anyone can see exactly where things stand.",
    visual: (
      <MockPanel title="Activity — Marcus Lee">
        <MockRows rows={[
          { left: "Step 3 email sent", right: "Mon 9:02am" },
          { left: "Opened twice", right: "Mon 9:41am" },
          { left: "Replied: \"Let's talk Thursday\"", badge: "Reply", right: "Mon 11:15am" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "You add a task and a note",
    youDo: "Set a follow-up task with a due date, and jot a note on what the prospect said.",
    weHandle: "Tasks stay visible until marked done; notes stack chronologically on the contact record for any teammate to read.",
    youGet: "Nothing gets forgotten between the reply and the actual follow-up call.",
    visual: (
      <MockPanel title="Tasks & notes — Marcus Lee">
        <MockRows rows={[
          { left: "Follow-up call", muted: "Due tomorrow 10:00am", right: "Open" },
          { left: "Note: wants pricing for 50 seats", muted: "Added by Priya", right: "Mon 11:20am" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "The deal moves through stages",
    youDo: "Drag the card, or bulk-move several contacts, as the conversation progresses.",
    weHandle: "Stage changes are timestamped and instantly visible to the whole workspace, no refresh needed.",
    youGet: "An owner and a stage for every open conversation, always current.",
    visual: (
      <MockPanel title="Deal — Northwind Logistics">
        <MockRows rows={[
          { left: "Owner", right: "Priya S." },
          { left: "Stage", right: "Proposal Sent", badge: "Day 4" },
          { left: "Next task", muted: "Follow-up call", right: "Tomorrow 10:00" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "The deal is won or lost",
    youDo: "Move the card to Won or Lost when the outcome is clear.",
    weHandle: "The full outreach-to-close history stays on the record so you can see which campaigns and mailboxes actually produce revenue.",
    youGet: "A closed-loop view from first send to signed deal, without exporting anything to a spreadsheet.",
    visual: (
      <MockPanel title="Pipeline — Won this month">
        <MockRows rows={[
          { left: "Northwind Logistics", muted: "42 days in pipeline", right: "Won", badge: "Closed" },
          { left: "Kestrel Freight", muted: "19 days in pipeline", right: "Won", badge: "Closed" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Kanban, title: "Customizable stages", text: "Add, rename or remove pipeline stages to match your process." },
  { icon: Users, title: "Contact records", text: "Every contact holds email, company, lead source and tags." },
  { icon: History, title: "Full activity timeline", text: "Sends, opens, clicks and replies appear on the contact automatically." },
  { icon: ListTodo, title: "Tasks with due dates", text: "Set a follow-up task and see it until it's marked done." },
  { icon: StickyNote, title: "Notes on every contact", text: "Log what a prospect said so any teammate has context." },
  { icon: UserCheck, title: "Ownership", text: "See who owns each contact and hand off without losing history." },
  { icon: Tags, title: "Tags and lead source", text: "Tag contacts and filter the pipeline by tag or source." },
  { icon: Filter, title: "Search, filter and sort", text: "Find contacts by name, email, activity or next task due." },
  { icon: ArrowRightLeft, title: "Bulk stage moves", text: "Move multiple contacts to a new stage in one action." },
  { icon: Inbox, title: "Reply-to-pipeline handoff", text: "A positive reply automatically creates or advances a pipeline card." },
  { icon: MousePointerClick, title: "Drag-and-drop board", text: "Move contacts between stages by dragging their card." },
  { icon: ClipboardList, title: "Real-time updates", text: "Stage moves and notes sync live across the workspace." },
];

const workflowSteps = [
  { title: "Lead", text: "A prospect enters via a campaign reply or a manual add." },
  { title: "Pipeline", text: "The contact lands on a stage, New Lead by default." },
  { title: "Activity", text: "Sends, opens, clicks and replies attach automatically to the contact." },
  { title: "Won", text: "The card moves to Won, keeping the full history attached." },
];

const useCases = [
  { icon: Users, audience: "Sales-led startups", scenario: "You need pipeline visibility without a full CRM setup.", outcome: "A working pipeline from your first campaign." },
  { icon: Inbox, audience: "Founder-led sales", scenario: "You send your own campaigns and need to track replies.", outcome: "Every reply becomes a card you can act on." },
  { icon: UserCheck, audience: "Small sales teams", scenario: "Multiple reps work the same list and need clear ownership.", outcome: "Clear ownership and stage visibility across the team." },
];

const docGroups = [
  {
    title: "Contacts & ownership",
    items: [
      "Contact record with email, name, company, lead source and tags",
      "Manual add or automatic creation from a campaign reply",
      "Search by name or email, filter by tag or lead source",
      "Ownership visible per contact for handoffs between reps",
    ],
  },
  {
    title: "Pipeline & stages",
    items: [
      "Custom stages per workspace with names and colors",
      "Drag-and-drop board with bulk multi-select stage moves",
      "Sort by recent activity, date added, last reply or next task",
      "Real-time board updates as teammates work contacts",
    ],
  },
  {
    title: "Activity, tasks & notes",
    items: [
      "Automatic timeline of sends, opens, clicks and replies",
      "Tasks with due dates, visible until marked complete",
      "Free-text notes stacked chronologically on each contact",
      "Full outreach history retained after a campaign ends",
    ],
  },
];

const details = [
  "Stages are workspace-specific — rename, recolor or delete without affecting other workspaces",
  "New contacts are stamped with the campaign and mailbox that generated them, when applicable",
  "Bulk actions apply to any current filter or search selection, not just visible rows",
  "Tasks carry a due date and a completed flag, and stay listed until resolved",
  "Notes are attributed to the teammate who wrote them and timestamped",
  "The activity timeline merges campaign events (sent, opened, clicked, replied) with manual notes in one feed",
  "Pipeline changes sync live across the workspace — no manual refresh needed to see a teammate's move",
  "Tags and lead source can be used together as filters to narrow the pipeline to a specific segment",
  "Deleting a stage does not delete its contacts — they can be reassigned to another stage",
  "Every action — move, note, task — is scoped to the workspace, so agencies keep client pipelines separate",
];

const beforeAfter = {
  before: [
    "Interested replies sit unread in a shared mailbox",
    "Deal stage lives in a spreadsheet updated once a week",
    "Email history, notes and next steps live in three tools",
    "Nobody knows who's supposed to follow up with whom",
    "Won deals have no record of what outreach actually produced them",
  ],
  after: [
    "Positive replies open a pipeline card the moment they land",
    "Stages, tags and tasks update from real activity, not a weekly export",
    "Full send, open, click, reply, note and task history on every contact",
    "Ownership is visible on the card, so handoffs don't drop context",
    "Won deals keep their full outreach history for reporting on what worked",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="CRM"
        title="A pipeline built from your"
        highlight="outbound replies"
        description="Track every contact from first touch to closed deal without a heavyweight CRM. Stages, ownership, activity history, tasks and notes live next to the campaign that created them."
        benefits={["Customizable pipeline stages", "Full outreach activity timeline", "Tasks and notes on every contact"]}
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="CRM dashboard"
        title="Pipeline built from your outreach"
        description="Contacts, stages, activity, tasks and notes connected to your campaign history."
      >
        <div className="p-4 sm:p-6">
          <MockPanel title="Pipeline — Outbound Q3">
            <MockRows rows={[
              { left: "New Lead", right: "42 contacts", muted: "Auto-added from campaigns" },
              { left: "Meeting Booked", right: "11 contacts", badge: "Hot" },
              { left: "Proposal Sent", right: "6 contacts" },
              { left: "Won", right: "4 contacts", badge: "Closed" },
            ]} />
          </MockPanel>
        </div>
      </BigPreview>
      <Section title="Why outbound pipeline goes missing">
        <PainPoints items={pains} />
      </Section>
      <Section id="how-it-works" title="From reply to closed deal">
        <Walkthrough steps={walkSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="The real workflow" description="Lead to contact to pipeline to won — end to end." muted>
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep capabilities" description="What's actually tracked and manageable on every contact.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={details} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch.">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="crm" title="From reply to revenue" />
      <Section muted>
        <PageFaqs page="crm" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Turn replies into a pipeline you can actually manage"
        description="Stop losing interested prospects in a shared inbox. Every reply becomes a card with a stage, an owner, a history and a next step."
      />
    </MarketingLayout>
  );
}
