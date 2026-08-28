import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  FileSpreadsheet,
  Inbox,
  ListTodo,
  Search,
  Send,
  Tags,
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
  StepList,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  CrmContactDetailMock,
  CrmOrganizationMock,
  CrmPipelineMock,
  CrmTableMock,
  CrmTasksMock,
  FlowChain,
  InboxToCrmMock,
  LeadActivityTimeline,
} from "@/components/site/CrmProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What information can I store for a lead?",
    a: "Name, email, company, job title, phone, website, location and LinkedIn URL, plus the workspace fields MunchReach maintains: lead status, pipeline stage, owner, tags, lead source and deal value. Notes, tasks and activity are stored on the same record.",
  },
  {
    q: "Can I see a lead's outreach history?",
    a: "Yes. Every campaign touch — the step that was sent, the delivery, follow-ups and any reply — is recorded on the contact's activity timeline, together with notes your team added and tasks that were created.",
  },
  {
    q: "Can I organize leads by status or tags?",
    a: "Yes. Each contact has a lead status and a pipeline stage, and you can apply as many tags as you like. Search and filter the contact list by status, tag, owner, campaign or lead source.",
  },
  {
    q: "Can I track follow-up tasks?",
    a: "Yes. Add a task with a title and a due date to any contact, see open tasks on the record and mark them complete. Overdue tasks stay visible until they are resolved.",
  },
  {
    q: "How does CRM work with campaigns?",
    a: "Contacts you import or add can be enrolled in campaigns, and the sends, deliveries, follow-ups and replies that campaign produces are written back to the contact's activity as they happen.",
  },
  {
    q: "How does CRM work with UniBox?",
    a: "Replies land in UniBox as threaded conversations linked to the contact. The conversation is reachable from the contact record, and the reply is logged as an activity so the lead history stays complete.",
  },
];

export const Route = createFileRoute("/product/crm")({
  head: () =>
    metaFor(
      "MunchReach CRM — Turn Outbound Leads Into Organized Opportunities",
      "Contacts, activity, tasks and pipeline in one workspace. See every lead's outreach history, owner, status and next action beside your campaigns and inbox.",
      "/product/crm",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: FileSpreadsheet,
    title: "Leads live in three places",
    text: "A spreadsheet, a shared inbox and someone's notes — nobody is sure which one is current.",
  },
  {
    icon: Inbox,
    title: "Replies get buried",
    text: "An interested prospect answers, the thread scrolls away, and the follow-up never happens.",
  },
  {
    icon: Users,
    title: "Nobody owns the lead",
    text: "No owner, no stage, no next action — so the same prospect is chased twice or not at all.",
  },
];

const solutions = [
  {
    eyebrow: "A. Contact detail",
    title: "Everything about a lead on one screen",
    text: "Contact fields on the left, the full conversation and activity timeline on the right. You never have to reconstruct what happened.",
    bullets: [
      "Email, company, job title, tags, owner, status and campaign together",
      "Emails, replies, notes and tasks on a single timeline",
      "Open tasks visible on the record, with due dates",
    ],
    visual: <CrmContactDetailMock />,
  },
  {
    eyebrow: "B. Tasks",
    title: "Know what needs to happen next",
    text: "A reply is not an outcome. Turn it into a task with a due date so the follow-up actually happens.",
    bullets: [
      "Follow up with prospect, review positive reply, schedule meeting",
      "Overdue tasks stay visible until they are resolved",
      "Tasks live on the contact, so context is one click away",
    ],
    visual: <CrmTasksMock />,
  },
  {
    eyebrow: "C. Organization",
    title: "Segment leads the way you work",
    text: "Status, tags, owner, campaign, company and lead source are all filterable, so any slice of the list is a couple of clicks away.",
    bullets: [
      "Tags are free-form — label by intent, segment or client",
      "Filter by owner to see only your book",
      "Lead source shows whether the contact was imported, added or replied in",
    ],
    visual: <CrmOrganizationMock />,
  },
];

const outboundFlow = [
  { title: "Lead imported", text: "CSV or manual add." },
  { title: "Added to campaign", text: "Enrolled in a sequence." },
  { title: "Email sent", text: "From the assigned mailbox." },
  { title: "Reply received", text: "Matched to the lead." },
  { title: "Conversation appears", text: "Threaded in UniBox." },
  { title: "Activity updated", text: "Logged on the record." },
  { title: "Sales follow-up", text: "Task and next action." },
  { title: "Opportunity", text: "Stage moves forward." },
];

const why = [
  {
    icon: UserCheck,
    title: "Know every lead",
    text: "Contact information, activity, campaign history and status together on one record.",
  },
  {
    icon: Tags,
    title: "Stay organized",
    text: "Statuses, tags, ownership and activities keep the pipeline clear.",
  },
  {
    icon: ListTodo,
    title: "Know what happens next",
    text: "Follow-ups and sales actions stay visible instead of living in someone's head.",
  },
];

const audiences = [
  {
    icon: Users,
    audience: "Sales teams",
    scenario: "Several reps working the same outbound list.",
    outcome: "Ownership, activity and follow-ups stay organized.",
  },
  {
    icon: Building2,
    audience: "Agencies",
    scenario: "Lead activity for several clients at once.",
    outcome: "Client outreach managed without scattered spreadsheets.",
  },
  {
    icon: Send,
    audience: "Founders",
    scenario: "You are running the outbound and the sales calls.",
    outcome: "Prospects stay organized while you handle both.",
  },
];

const steps = [
  { title: "Add or import leads", text: "Upload a CSV or add a contact by hand." },
  { title: "Run outreach", text: "Enrol the contact in a campaign." },
  { title: "Track activity and replies", text: "Sends and responses log themselves." },
  { title: "Manage the next action", text: "Set a task, move the stage, close it." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach CRM"
        title="Turn Your Outbound Leads Into"
        highlight="Organized Opportunities."
        description="Keep your contacts, conversations, activities, tasks and pipeline organized in one workspace — from the first outreach email to the next sales action."
        benefits={["Full lead history", "Owner and status on every contact", "Tasks for the next step"]}
        primaryCta="Start Using CRM"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <BigPreview
        id="product"
        eyebrow="Inside the CRM"
        title="Every prospect, with the context around them"
        description="Contacts, company, email, status, owner, tags, last activity and the next action — in one list."
      >
        <CrmTableMock />
      </BigPreview>

      <Section
        muted
        title="Your leads shouldn't disappear after you send the email"
        description="Outbound creates interest. Without a place to put it, that interest evaporates."
      >
        <PainPoints items={problems} />
      </Section>

      <Section
        title="One place to manage every prospect"
        description="Search, filter, organize and manage your prospects without jumping between spreadsheets and inboxes."
      >
        <CrmTableMock />
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          {["Search by name, email or company", "Filter by status", "Filter by tag", "Filter by owner", "Filter by campaign"].map(
            (f) => (
              <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1">
                <Search className="size-3" />
                {f}
              </span>
            ),
          )}
        </div>
      </Section>

      <Section
        id="how-it-works"
        muted
        title="See the full story behind every lead"
        description="Three parts of the CRM you will use every day."
      >
        <SolutionSplit rows={solutions} />
      </Section>

      <Section
        title="Know what happened before you take the next step"
        description="The timeline gives you the context to answer well — what was sent, when it landed, and what the prospect said."
      >
        <LeadActivityTimeline />
      </Section>

      <BigPreview
        id="pipeline"
        eyebrow="Pipeline"
        title="Move leads from outreach to opportunity"
        description="These are the default stages a new workspace starts with. Stages are configurable — rename them, reorder them or add your own."
      >
        <CrmPipelineMock />
      </BigPreview>

      <Section
        muted
        title="Keep your leads organized your way"
        description="Tags, status, owner, campaign, company and lead source are all real fields on the contact — and all filterable."
      >
        <CrmOrganizationMock />
      </Section>

      <Section
        title="Your outreach and CRM work together"
        description="The same record follows the lead from import to opportunity."
      >
        <FlowChain steps={outboundFlow} />
      </Section>

      <Section
        muted
        title="Replies become part of the lead record"
        description="You read the reply with the lead's history beside it — no copying information between systems."
      >
        <InboxToCrmMock />
      </Section>

      <Section title="Before and after">
        <BeforeAfter
          beforeTitle="Spreadsheet + inbox + notes"
          afterTitle="MunchReach CRM"
          before={[
            "Lead data in a spreadsheet someone last touched a week ago",
            "Replies buried in individual mailboxes",
            "Follow-ups tracked in a personal to-do list",
            "No record of what the prospect was already sent",
            "Ownership decided in a Slack thread",
          ]}
          after={[
            "One contact record per prospect, always current",
            "Replies threaded and linked to the lead",
            "Tasks with due dates on the contact itself",
            "Full send, delivery and reply history on the timeline",
            "Owner, status and stage visible on the list",
          ]}
        />
      </Section>

      <Section muted title="Why MunchReach CRM">
        <FeatureGrid items={why} />
      </Section>

      <Section title="Who it's for">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section muted title="How it works">
        <StepList steps={steps} />
      </Section>

      <TestimonialCarousel page="crm" title="From reply to revenue" />

      <Section muted>
        <PageFaqs page="crm" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Stop losing track of your best leads."
        description="Keep your prospects, conversations, activities and next actions organized in MunchReach."
        cta="Start Using CRM"
      />
    </MarketingLayout>
  );
}
