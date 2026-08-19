import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  GitBranch,
  Inbox,
  ListTodo,
  Megaphone,
  Rocket,
  Send,
  Tags,
  Target,
  Users,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  FeatureBento,
  MarketingLayout,
  MockPanel,
  MockRows,
  Section,
  StatStrip,
  metaFor,
  BigPreview,
} from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    q: "What are Sendloop Automations?",
    a: "Automations are workflows that run on Sendloop's backend. Each one starts from a real product event, optionally checks conditions, then performs actions such as enrolling a lead in a campaign, updating CRM records, creating tasks or sending notifications.",
  },
  {
    q: "What can trigger an automation?",
    a: "Lead events (lead added, lead status changed), campaign events (lead enters campaign, campaign started or completed), email events from delivery webhooks (sent, delivered, opened, clicked, bounced), inbox events (lead replied, positive reply detected, unsubscribed), CRM events (stage changed, task completed), Calendly meeting booked or cancelled, mailbox connected, warmup status changed, and signed inbound webhooks.",
  },
  {
    q: "What actions can an automation perform?",
    a: "Add or remove a lead from a campaign, stop follow-ups, pause enrollment, move a CRM stage, add or remove tags, create a CRM task, update a lead field, assign an owner, log a CRM activity, send an in-app notification, send a Slack message through the connected integration, send a signed webhook, wait, or end the run.",
  },
  {
    q: "Can automations work with campaigns?",
    a: "Yes. Campaign and email events start workflows, and campaign actions let you enroll leads, remove them, or cancel every queued follow-up for a lead the moment they reply.",
  },
  {
    q: "Can automations update CRM records?",
    a: "Yes. Automations move contacts between pipeline stages, edit lead fields, add or remove tags, assign owners, create tasks and write entries into the contact's activity timeline.",
  },
  {
    q: "Can I create multi-step workflows?",
    a: "Yes. Workflows chain triggers, conditions, waits and actions across as many steps as you need. Waits are stored in the database and resumed by the backend worker, and conditions can branch the run down an if/else path.",
  },
];

export const Route = createFileRoute("/automations")({
  head: () =>
    metaFor(
      "Email Outreach Automations — Sendloop",
      "Trigger follow-ups, CRM updates, tasks and notifications automatically from campaign, lead and inbox activity with Sendloop Automations.",
      "/automations",
      faqs,
    ),
  component: Page,
});

const features = [
  { icon: Zap, title: "Trigger-based workflows", text: "Start a run from any real product event — lead added, campaign started, email delivered, reply received, stage changed or a signed inbound webhook." },
  { icon: Send, title: "Automated follow-ups", text: "Stop pending follow-ups the second a lead replies, or enroll them into the next campaign automatically." },
  { icon: Target, title: "Lead actions", text: "Update lead fields, add or remove tags, assign an owner and change lead status without touching a record by hand." },
  { icon: Megaphone, title: "Campaign actions", text: "Add or remove a lead from a campaign, cancel queued sends and pause further enrollment." },
  { icon: Inbox, title: "Reply-based actions", text: "React to inbound replies from the Unified Inbox, including replies classified as positive, and route them straight into your pipeline." },
  { icon: GitBranch, title: "CRM updates", text: "Move contacts between pipeline stages and write entries into the contact activity timeline as the workflow runs." },
  { icon: ListTodo, title: "Task creation", text: "Create real CRM tasks on the contact with a title and a due date offset in days." },
  { icon: Bell, title: "Notifications", text: "Send in-app notifications to the workspace, or push a message to Slack through the connected integration." },
  { icon: Workflow, title: "Conditional logic", text: "Evaluate lead, CRM, campaign, email activity, reply sentiment, mailbox and meeting fields, then branch the run accordingly." },
  { icon: Clock, title: "Multi-step automation", text: "Chain conditions, waits and actions. Waits persist in the database and resume from the backend worker." },
];

const flow = [
  { kind: "Trigger", title: "Lead replies", text: "An inbound reply lands in the Unified Inbox.", icon: Inbox },
  { kind: "Condition", title: "Check reply type", text: "Reply sentiment is positive.", icon: GitBranch },
  { kind: "Action", title: "Update CRM", text: "Move the contact to the next pipeline stage.", icon: Users },
  { kind: "Action", title: "Create task", text: "Follow up on reply, due in 1 day.", icon: ListTodo },
  { kind: "Action", title: "Notify team", text: "Send an in-app and Slack notification.", icon: Bell },
];

const useCases = [
  { icon: Rocket, title: "Sales teams", text: "Interested replies stop the sequence, advance the deal and land on a rep's task list the same minute." },
  { icon: Building2, title: "Agencies", text: "Run the same reply-handling and reporting workflow across every client workspace without manual admin." },
  { icon: Workflow, title: "SaaS companies", text: "Route trial-intent replies to the right owner and keep pipeline stages accurate automatically." },
  { icon: Target, title: "Lead generation", text: "Tag, score and re-route new leads the moment they are imported or enter a campaign." },
  { icon: Send, title: "Follow-up workflows", text: "Cancel queued follow-ups on reply, or wait a set number of days before enrolling a lead in the next campaign." },
  { icon: Tags, title: "CRM workflows", text: "Keep owners, tags, fields and activity timelines updated from campaign and inbox events." },
];

const stats = [
  { value: "19", label: "Real triggers across leads, campaigns, email, inbox, CRM and webhooks" },
  { value: "15", label: "Actions from campaign control to CRM, tasks, notifications and webhooks" },
  { value: "Multi-step", label: "Conditions, waits and branching in a single workflow" },
  { value: "Backend worker", label: "Runs persist and resume server-side, not in the browser" },
];

function Page() {
  return (
    <MarketingLayout>
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Automations
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Automate your cold outreach{" "}
            <span className="text-gradient">from start to finish</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Sendloop Automations trigger actions, follow-ups and multi-step workflows
            automatically from your campaign, lead and inbox activity — so replies get
            handled, CRM records stay accurate and nobody chases updates by hand.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">Start for Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
        </div>
      </section>

      <BigPreview
        eyebrow="Automations workspace"
        title="Workflows that run on your real outreach data"
        description="Triggers, conditions, actions and run history — the same objects the Sendloop Automations engine executes."
      >
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
          <MockPanel title="Automation — Positive reply handler">
            <MockRows
              rows={[
                { left: "Status", right: "Active", badge: "Live" },
                { left: "Trigger", muted: "Unified Inbox", right: "Positive reply detected" },
                { left: "Condition", muted: "Reply sentiment", right: "is positive" },
                { left: "Action 1", right: "Stop campaign follow-ups" },
                { left: "Action 2", right: "Move CRM stage" },
                { left: "Action 3", muted: "Due in 1 day", right: "Create task" },
                { left: "Action 4", right: "Send Slack notification" },
              ]}
            />
          </MockPanel>
          <MockPanel title="Recent executions">
            <MockRows
              rows={[
                { left: "marcus@northwind.io", right: "Completed", badge: "5 steps" },
                { left: "sara@brightpath.co", right: "Completed", badge: "5 steps" },
                { left: "team@fieldops.dev", muted: "Condition not met", right: "Skipped" },
                { left: "dana@arcline.com", muted: "Resumes in 2 days", right: "Waiting" },
              ]}
            />
          </MockPanel>
        </div>
      </BigPreview>

      <Section
        title="Real automation capabilities"
        description="Everything below is executed by the Sendloop Automations engine."
      >
        <FeatureBento items={features} />
      </Section>

      <Section
        title="How it works"
        description="A trigger fires, conditions decide, actions run — then the workflow moves to the next step."
        muted
      >
        <div id="how-it-works" className="scroll-mt-24">
          <div className="grid gap-4 md:grid-cols-5">
            {flow.map((node, i) => (
              <Reveal key={node.title} delay={i * 0.08}>
                <div className="group relative h-full rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
                  <Badge variant="secondary" className="text-[10px] tracking-wide uppercase">
                    {node.kind}
                  </Badge>
                  <node.icon className="mt-4 h-5 w-5 text-primary" />
                  <h3 className="mt-3 text-sm font-semibold">{node.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{node.text}</p>
                  {i < flow.length - 1 ? (
                    <ArrowRight className="absolute top-1/2 -right-3 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground/50 md:block" />
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Built for the way you run outreach">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase, i) => (
            <Reveal key={useCase.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
                <useCase.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-base font-semibold">{useCase.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{useCase.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section title="Details that matter" muted>
        <BulletList
          items={[
            "Runs execute on the backend worker, with waits stored in the database",
            "Duplicate events are ignored so a lead is never processed twice for the same trigger",
            "Every run is logged with its steps, outcome and any skipped actions",
            "Conditions read lead, CRM, campaign, email activity, reply, mailbox and meeting fields",
            "Outbound webhooks are signed with an HMAC header",
            "Automations are scoped to a workspace and respect its permissions",
          ]}
        />
      </Section>

      <Section>
        <StatStrip stats={stats} />
      </Section>

      <Section muted>
        <FaqBlock faqs={faqs} />
      </Section>

      <CtaBlock
        title="Turn repetitive outreach tasks into automated workflows."
        description="Connect triggers, conditions and actions once — Sendloop runs them on every reply, campaign and CRM change."
      />
      <div className="sr-only">
        <CheckCircle2 aria-hidden />
        <Webhook aria-hidden />
      </div>
    </MarketingLayout>
  );
}
