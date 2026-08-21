import { createFileRoute } from "@tanstack/react-router";
import {
  Kanban,
  UserCheck,
  History,
  Tags,
  ListTodo,
  Share2,
  AlertTriangle,
  FileSpreadsheet,
  GitBranch,
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
  metaFor,
  BigPreview,
  FeatureBento,
  WorkflowStrip,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Does this replace Salesforce or HubSpot?", a: "For most outbound-led teams, yes — MunchReach's CRM covers pipeline, notes and tasks end to end. If you already run a CRM for closed-won accounting, sync instead of replacing it." },
  { q: "Can I customise stages?", a: "Yes. Every workspace defines its own stages, from New Lead through Meeting Booked, Proposal Sent, Won and Lost — as many as your process needs." },
  { q: "Is activity history kept after a campaign ends?", a: "Yes, the full send, open, click and reply history stays permanently on the prospect record, even after the sequence finishes." },
  { q: "Can clients see only their own pipeline?", a: "Yes, using the Client Viewer role scoped to a single workspace, filtered to their deals only." },
  { q: "What happens to a lead when they reply?", a: "Replies automatically create or update a pipeline card, tag the thread, and notify the assigned owner so nothing sits in an inbox unattended." },
  { q: "Can I bulk-edit deals?", a: "Yes — select any view and bulk-update stage, owner, tags or lost reason in one action." },
];

export const Route = createFileRoute("/product/crm")({
  head: () => metaFor(
    "Outbound CRM & Pipeline Tracking — MunchReach",
    "Track prospects through deal stages with owners, notes, tasks and full campaign activity history, built into MunchReach.",
    "/product/crm",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: AlertTriangle, title: "Replies fall through the cracks", text: "A prospect says \"interested\" in your sequencing tool, but nobody follows up because it never reaches a pipeline." },
  { icon: FileSpreadsheet, title: "Spreadsheets as a CRM", text: "Reps keep their own tracker, owners overlap, and nobody can answer 'what's our real pipeline this week?'" },
  { icon: GitBranch, title: "Context lives in three tools", text: "The email history is in your sender, the notes are in Slack, and the deal stage is in a CRM that was never updated." },
];

const solutionRows = [
  {
    eyebrow: "Pipeline",
    title: "Every reply becomes a deal card automatically",
    text: "The moment a prospect replies positively, MunchReach creates or advances their pipeline card — no manual import, no second tool to update.",
    bullets: ["Customisable stages per workspace", "Auto-advance on positive reply detection", "One-click move from inbox to pipeline"],
    visual: (
      <MockPanel title="Pipeline — Outbound Q3">
        <MockRows rows={[
          { left: "New Lead", right: "128 deals", muted: "Auto-added from campaigns" },
          { left: "Meeting Booked", right: "34 deals", badge: "Hot" },
          { left: "Proposal Sent", right: "19 deals" },
          { left: "Won", right: "$142,000", badge: "Closed" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Ownership",
    title: "Assign deals to reps and see who's actually closing",
    text: "Give every prospect an owner, track handoffs, and compare conversion rate stage-by-stage across your team.",
    bullets: ["Per-rep pipeline and win-rate view", "Round-robin or manual assignment", "Reassign in bulk when a rep is out"],
    visual: (
      <MockPanel title="Deal — Northwind Logistics">
        <MockRows rows={[
          { left: "Owner", right: "Priya S." },
          { left: "Stage", right: "Proposal Sent", badge: "Day 4" },
          { left: "Last touch", muted: "Replied to bump email", right: "2h ago" },
          { left: "Next task", muted: "Follow up call", right: "Tomorrow 10:00" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "History",
    title: "One timeline, from first send to signed contract",
    text: "Every send, open, click, reply, note and task lives on the prospect record — so any rep can pick up a deal cold and know exactly where it stands.",
    visual: (
      <MockPanel title="Activity — Marcus Lee">
        <MockRows rows={[
          { left: "Step 3 email sent", right: "Mon 9:02am" },
          { left: "Opened twice", right: "Mon 9:41am" },
          { left: "Replied: \"Let's talk Thursday\"", badge: "Reply", right: "Mon 11:15am" },
          { left: "Note added by Priya", muted: "Wants pricing for 50 seats", right: "Mon 11:20am" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Kanban, title: "Pipeline stages", text: "Customisable stages from new lead to meeting booked, proposal sent and won or lost." },
  { icon: UserCheck, title: "Deal owners", text: "Assign prospects to reps and see per-owner pipeline and conversion." },
  { icon: History, title: "Activity timeline", text: "Every send, open, click, reply and note in one chronological view." },
  { icon: Tags, title: "Tags and segments", text: "Tag prospects on the fly and build reusable segments for future campaigns." },
  { icon: ListTodo, title: "Tasks and reminders", text: "Schedule a call-back or nudge and get reminded in the inbox." },
  { icon: Share2, title: "Two-way sync", text: "Push and pull records with HubSpot, Pipedrive, Zapier, Make or webhooks." },
];

const steps = [
  { title: "Import prospects", text: "CSV upload, manual entry or an integration." },
  { title: "Run outreach", text: "Campaign activity is attached to the prospect automatically." },
  { title: "Qualify replies", text: "Move interested prospects into your pipeline from the inbox in one click." },
  { title: "Report on revenue", text: "Attribute meetings and deals back to the campaign and mailbox that produced them." },
];

const stats = [
  { value: "128 deals", label: "Avg. pipeline size after 90 days" },
  { value: "0 spreadsheets", label: "Needed to track outbound pipeline" },
  { value: "3.2x", label: "Faster reply-to-meeting handoff" },
  { value: "6", label: "Built-in role types for pipeline visibility" },
];

const beforeAfter = {
  before: [
  "Interested replies sit unread in a shared mailbox",
  "Deal stage lives in a spreadsheet updated once a week",
  "Email history, notes and next steps live in three tools"
],
  after: [
  "Positive replies open a deal card the moment they land",
  "Stages, owners and tasks update from real activity",
  "Full send, open, click and reply history on every record"
],
};

const useCases = [
  {
    "audience": "Sales-led startups",
    "scenario": "You need pipeline visibility without paying for and configuring a full CRM.",
    "outcome": "A working pipeline on day one, no admin."
  },
  {
    "audience": "Agencies",
    "scenario": "Clients want to see pipeline progress but not each other's data.",
    "outcome": "Client Viewer roles scoped to one workspace."
  },
  {
    "audience": "Teams with an existing CRM",
    "scenario": "Reps forget to log outbound activity into Salesforce or HubSpot.",
    "outcome": "Activity captured automatically, then synced across."
  }
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow={"CRM"}
        title={"A lightweight CRM built for"}
        highlight={"outbound pipelines"}
        description={"Track prospects from first touch to closed deal without a heavyweight CRM. Stages, owners, notes and activity history live next to the campaign that created them."}
        secondaryCta="Explore CRM"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="CRM dashboard"
        title="Pipeline built from your outreach"
        description="Contacts, companies, deals and tasks connected to campaign history."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="Why outbound pipeline goes missing">
        <PainPoints items={pains} />
      </Section>
      <Section title="How MunchReach solves it" description="Pipeline that builds itself from your outreach.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="How it works" muted>
        <WorkflowStrip steps={steps} />
      </Section>
      <Section title="Before and after" description="What changes the week you switch." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <Section title="Who it is for" description="Built for the way outbound teams actually work.">
        <UseCaseGrid items={useCases} />
      </Section>
      <TestimonialCarousel page="crm" title="From reply to revenue" />
      <Section title="Details that matter">
        <BulletList items={["Custom fields for any prospect attribute", "Duplicate detection at workspace level", "Bulk stage and owner updates", "Lost reasons and re-engagement lists", "Export any view to CSV", "Role-based visibility for clients"]} />
      </Section>
      <Section>
        <StatStrip stats={stats} />
      </Section>
      <Section muted>
        <PageFaqs page="crm" defaults={faqs} />
      </Section>
      <CtaBlock title={"Keep pipeline where the conversation happens"} description={"Move from reply to meeting without exporting a single spreadsheet."} />
    </MarketingLayout>
  );
}
