import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  Clock,
  GitBranch,
  ListTodo,
  Repeat,
  Rocket,
  Tags,
  Users,
  Workflow,
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
  AutomationBuilderMock,
  CatalogGrid,
  DetailList,
  NumberedSteps,
  WhenIfThen,
  WorkflowCards,
} from "@/components/site/AutomationsProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What can start an automation?",
    a: "Real product events: a lead is added or enters a campaign, a campaign starts or completes, an email is sent, delivered, opened, clicked or bounced, a reply lands, a reply is classified positive, a lead unsubscribes, a lead status or CRM stage changes, a task is completed, a meeting is booked or cancelled, a mailbox connects, warmup status changes, or a signed webhook hits the automation's endpoint.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Every automation is built as WHEN → IF → THEN from dropdown lists. Conditions use plain operators like is, is not, contains, is empty, greater than and less than.",
  },
  {
    q: "What can an automation actually do?",
    a: "Add or remove a lead from a campaign, stop follow-ups, pause enrollment, move a CRM stage, add or remove a tag, create a task, update a lead field, assign an owner, log a CRM activity, send an internal or Slack notification, send a signed webhook, wait, or end the run.",
  },
  {
    q: "How do waits work?",
    a: "A wait is stored in the database with a resume time and picked back up by the backend worker, so runs survive restarts and deploys. You can wait minutes, hours or days, until a specific time, or until business hours.",
  },
  {
    q: "Can I see what an automation did?",
    a: "Yes. Each run records the trigger event, the branch it followed, every step's status and any error, so you can tell the difference between a skipped condition and a genuine failure.",
  },
  {
    q: "Can I test an automation before turning it on?",
    a: "Yes. Automations have an active and inactive state and a test run, so you can check the logic on a real record before it starts acting on your whole workspace.",
  },
];

export const Route = createFileRoute("/automations")({
  head: () =>
    metaFor(
      "Automations — Outbound Workflows on Autopilot | MunchReach",
      "Connect campaigns, leads, replies, follow-ups and team workflows so the right action happens automatically — built visually with triggers, conditions and actions.",
      "/automations",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: Clock,
    title: "Follow-ups get forgotten",
    text: "A prospect replies on Friday, nobody picks it up, and the thread is cold by Monday.",
  },
  {
    icon: ListTodo,
    title: "Leads sit without action",
    text: "A lead changes status and nothing happens — no owner, no tag, no task, no next step.",
  },
  {
    icon: Repeat,
    title: "Teams repeat the same manual tasks",
    text: "Stop the sequence, tag the lead, assign a rep, create a task. The same five clicks, every single reply.",
  },
];

const steps = [
  {
    title: "Choose a trigger",
    text: "Pick the event that starts the workflow — a reply, a bounce, a status change, a booked meeting. Trigger filters let you scope it to one campaign.",
  },
  {
    title: "Add conditions",
    text: "Conditions read live lead, campaign and engagement data. If they don't match, the run follows the else branch instead of acting.",
  },
  {
    title: "Choose an action",
    text: "Stack as many actions as you need — update the lead, move the CRM stage, assign an owner, create a task, notify the team.",
  },
  {
    title: "Let MunchReach execute it",
    text: "Runs are queued per event and processed by the backend worker, with waits resuming on schedule and every step logged.",
  },
];

const triggers = [
  { title: "Lead added", group: "Leads", text: "A lead is created or imported into the workspace." },
  { title: "Lead enters campaign", group: "Campaigns", text: "A lead is enrolled as a campaign recipient." },
  { title: "Email sent", group: "Email", text: "A campaign email is accepted by the sending provider." },
  { title: "Email delivered", group: "Email", text: "The provider confirms delivery to the recipient." },
  { title: "Email bounced", group: "Email", text: "The provider reports a bounce for that address." },
  { title: "Lead replied", group: "Inbox", text: "A real inbound reply lands in the Unified Inbox." },
  { title: "Positive reply detected", group: "Inbox", text: "An inbound reply is classified as interested." },
  { title: "Lead status changed", group: "Leads", text: "A lead's status field changes value." },
  { title: "CRM stage changed", group: "CRM", text: "A contact moves to another pipeline stage." },
  { title: "Meeting booked", group: "Meetings", text: "A Calendly booking webhook is received." },
  { title: "Campaign completed", group: "Campaigns", text: "A campaign finishes its sequence." },
  { title: "Webhook received", group: "Webhooks", text: "A signed request hits this automation's own endpoint." },
];

const actions = [
  { title: "Update lead field", group: "CRM", text: "Write a value to an editable field such as status, industry or deal value." },
  { title: "Move CRM stage", group: "CRM", text: "Move the contact in the real pipeline and log the change." },
  { title: "Add or remove tag", group: "CRM", text: "Keep segments accurate without touching the lead by hand." },
  { title: "Assign owner", group: "CRM", text: "Give a workspace member the contact so it has a clear next owner." },
  { title: "Create task", group: "CRM", text: "Create a real CRM task with a title and a due date in days." },
  { title: "Stop campaign follow-ups", group: "Campaigns", text: "Cancel every pending and scheduled email for that lead." },
  { title: "Add or remove from campaign", group: "Campaigns", text: "Enrol a lead in a sequence, or pull them out of one." },
  { title: "Notify the team", group: "Notifications", text: "Send an in-app notification, or a Slack message through the connected integration." },
  { title: "Wait", group: "Flow", text: "Pause the run for minutes, hours, days, until a time, or until business hours." },
];

const workflows = [
  {
    label: "Workflow A",
    title: "Positive reply routing",
    steps: [
      "Trigger: positive reply detected",
      "Condition: lead status is not Customer",
      "Action: stop campaign follow-ups",
      "Action: add tag “interested”",
      "Action: assign owner to a sales rep",
      "Action: create task “Follow up on reply”, due in 1 day",
    ],
    note: "Stops the sequence talking over a live conversation and gives the reply an owner.",
  },
  {
    label: "Workflow B",
    title: "No-response nudge",
    steps: [
      "Trigger: email delivered",
      "Wait: 3 days",
      "Condition: lead has not replied",
      "Action: add lead to the follow-up campaign",
    ],
    note: "The wait is stored with a resume time, so the run survives restarts and deploys.",
  },
  {
    label: "Workflow C",
    title: "Lead qualification",
    steps: [
      "Trigger: lead status changed",
      "Condition: status is Qualified",
      "Action: add tag “qualified”",
      "Action: assign owner",
      "Action: create task “Book intro call”",
    ],
    note: "Every qualified lead leaves with a tag, an owner and a scheduled next step.",
  },
  {
    label: "Workflow D",
    title: "Agency client routing",
    steps: [
      "Trigger: lead replied",
      "Condition: campaign is the client's campaign",
      "Action: assign the account's team member as owner",
      "Action: create a follow-up task",
      "Action: send a Slack notification to the client channel",
    ],
    note: "Automations are scoped to a workspace, so each client's routing stays separate.",
  },
];

const why = [
  {
    eyebrow: "Respond faster",
    title: "A reply gets an owner before anyone opens the inbox",
    text: "The moment a reply is classified positive, follow-ups stop, the lead is tagged and assigned, and a task lands on the rep's list.",
    bullets: [
      "No waiting for someone to notice the reply",
      "Queued follow-ups cancel so the sequence stops talking over the conversation",
      "Slack or in-app notification tells the team it happened",
    ],
    visual: <AutomationBuilderMock />,
  },
  {
    eyebrow: "Keep your pipeline organized",
    title: "Status changes always carry the same consequences",
    text: "When a lead's status or CRM stage changes, the tags, owner and tasks that should follow are applied the same way every time.",
    bullits: undefined,
    bullets: [
      "Tags applied consistently, not from memory",
      "Owner set so no record is unassigned",
      "Activity written to the contact's timeline",
    ],
    visual: <WhenIfThen />,
  },
];

const capabilities = [
  { icon: Workflow, title: "Visual automation builder", text: "Build WHEN → IF → THEN from dropdowns, no scripting." },
  { icon: GitBranch, title: "Triggers", text: "Real lead, campaign, email, inbox, CRM and meeting events." },
  { icon: ListTodo, title: "Conditions", text: "Live lead and campaign fields with plain operators." },
  { icon: Tags, title: "Actions", text: "Update, tag, assign, enrol, notify, webhook, end." },
  { icon: Clock, title: "Delays", text: "Wait minutes, hours, days, until a time, or until business hours." },
  { icon: Repeat, title: "Lead workflows", text: "Route a lead from reply through to a scheduled next step." },
  { icon: Users, title: "Team assignments", text: "Assign a workspace member as owner automatically." },
  { icon: Bell, title: "Execution visibility", text: "Run history with each step's status, result and error." },
];

const audiences = [
  {
    icon: Users,
    audience: "Sales teams",
    scenario: "Replies land while reps are in calls and follow-ups slip.",
    outcome: "Every reply is tagged, assigned and tasked automatically.",
  },
  {
    icon: Building2,
    audience: "Agencies",
    scenario: "Several clients, each with their own routing and owners.",
    outcome: "Workspace-scoped automations keep client workflows separate.",
  },
  {
    icon: Rocket,
    audience: "Growing outbound teams",
    scenario: "Process lives in someone's head and breaks when they're away.",
    outcome: "The process is built once and runs the same way every time.",
  },
];

const details = [
  { title: "Active / inactive state", text: "Turn an automation off without deleting it or losing its history." },
  { title: "Trigger filters", text: "Scope a trigger to a single campaign so unrelated events don't start the run." },
  { title: "Branching", text: "Conditions send the run down a true or else path, so one automation handles both outcomes." },
  { title: "Durable waits", text: "Waits are stored with a resume time and picked up by the backend worker." },
  { title: "Run history", text: "Each run logs its trigger, steps, statuses and errors for review." },
  { title: "Signed webhooks", text: "Send the run context to your own endpoint with an HMAC signature header." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Automations"
        title="Turn Repetitive Outreach Tasks"
        highlight="Into Automations."
        description="Connect your campaigns, leads, replies, follow-ups and team workflows so the right action happens automatically."
        benefits={["Visual builder", "Real product events", "Full run history"]}
        primaryCta="Build an Automation"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <Section
        muted
        title="Your team shouldn't have to remember every next step."
        description="Most outbound process failures are not strategy problems — they are someone forgetting a click."
      >
        <PainPoints items={problems} />
      </Section>

      <BigPreview
        id="product"
        eyebrow="Automation builder"
        title="Trigger, conditions, actions — and what actually ran"
        description="Name, trigger, conditions, actions, delay, active state, test controls and execution history in one screen."
      >
        <AutomationBuilderMock />
      </BigPreview>

      <Section id="how-it-works" muted title="How automations work">
        <NumberedSteps steps={steps} />
      </Section>

      <Section
        title="Automation triggers"
        description="Events that already exist in the product — nothing invented."
      >
        <CatalogGrid items={triggers} />
      </Section>

      <Section muted title="Actions" description="What an automation is allowed to do once its conditions match.">
        <CatalogGrid items={actions} />
      </Section>

      <Section title="Real workflows">
        <WorkflowCards items={workflows} />
      </Section>

      <Section muted title="Why automation matters">
        <SolutionSplit rows={why} />
        <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold">Reduce repetitive work</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Stopping follow-ups, tagging, assigning and creating a task is five manual actions per
            reply. Built once as an automation, it happens on every reply without anyone touching
            it — and the run history shows exactly what was done.
          </p>
        </div>
      </Section>

      <Section title="Before and after">
        <BeforeAfter
          beforeTitle="Without automation"
          afterTitle="With MunchReach"
          before={[
            "Manually checking the inbox for replies worth acting on",
            "Manually updating status, tags and owners",
            "Missed actions when someone is busy or away",
            "Process that only exists in one person's head",
          ]}
          after={[
            "A real product event starts the workflow",
            "Conditions decide whether it should act",
            "Actions run automatically, in order",
            "Every run logged with its result",
          ]}
        />
      </Section>

      <Section
        muted
        title="Build it the way you'd say it"
        description="WHEN this happens, IF this is true, THEN do these things."
      >
        <WhenIfThen />
      </Section>

      <Section title="What you get">
        <FeatureGrid items={capabilities} />
      </Section>

      <Section muted title="Who it's for">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section title="Details that matter">
        <DetailList items={details} />
      </Section>

      <TestimonialCarousel page="automations" title="Loved by outreach teams" />

      <Section muted>
        <PageFaqs page="automations" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Build the workflow once. Let MunchReach handle the repetitive work."
        description="Pick a trigger, add your conditions, choose the actions, and turn it on."
        cta="Build an Automation"
      />
    </MarketingLayout>
  );
}
