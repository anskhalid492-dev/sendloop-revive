/**
 * Visual workflow templates. Every template creates an editable DRAFT; nothing
 * goes live until the customer activates it. Only actions the engine really
 * executes are used, and no template sends email.
 */
import { newId, type Workflow, type WorkflowNode } from "./workflow-graph";

export const TEMPLATE_CATEGORIES = [
  "Reply Handling",
  "Sales",
  "Meetings",
  "Campaigns",
  "Email Engagement",
  "Lead Management",
  "Lead Qualification",
] as const;

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category: (typeof TEMPLATE_CATEGORIES)[number];
  trigger: string;
  triggerConfig?: Record<string, string>;
  build: () => Workflow;
};

const act = (action: string, config: Record<string, unknown> = {}, label?: string): WorkflowNode => ({
  id: newId(),
  type: "action",
  action,
  config,
  ...(label ? { label } : {}),
});
const wait = (mode: "days" | "hours", amount: number): WorkflowNode => ({ id: newId(), type: "wait", wait: { mode, amount } });
const wf = (nodes: WorkflowNode[]): Workflow => ({ version: 2, nodes });

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "reply-stop",
    name: "Reply → Stop follow-ups",
    description: "The moment a prospect replies, cancel every queued follow-up for that lead.",
    category: "Reply Handling",
    trigger: "lead.replied",
    build: () => wf([act("campaign.stop_followups")]),
  },
  {
    id: "reply-route",
    name: "Reply → Stop outreach and route",
    description: "Stop follow-ups, then route by reply sentiment: interested, out of office or not interested.",
    category: "Reply Handling",
    trigger: "lead.replied",
    build: () =>
      wf([
        act("campaign.stop_followups"),
        {
          id: newId(),
          type: "branch",
          label: "Reply sentiment",
          paths: [
            {
              key: "positive",
              label: "Interested",
              when: { match: "all", rules: [{ field: "reply.sentiment", operator: "is", value: "positive" }] },
              steps: [act("lead.add_tag", { tag: "interested" }), act("task.create", { title: "Reply to {{lead.email}}", dueInDays: 1 })],
            },
            {
              key: "ooo",
              label: "Out of office",
              when: { match: "all", rules: [{ field: "reply.sentiment", operator: "is", value: "out_of_office" }] },
              steps: [act("lead.add_tag", { tag: "out-of-office" })],
            },
            {
              key: "negative",
              label: "Not interested",
              when: { match: "all", rules: [{ field: "reply.sentiment", operator: "is", value: "negative" }] },
              steps: [act("lead.add_tag", { tag: "not-interested" })],
            },
          ],
          otherwise: { key: "otherwise", label: "Other", steps: [act("crm.activity", { detail: "Reply needs review" })] },
        },
      ]),
  },
  {
    id: "positive-interested",
    name: "Positive reply → Move to Interested",
    description: "Stop follow-ups, tag the lead and notify the team.",
    category: "Sales",
    trigger: "reply.positive",
    build: () =>
      wf([
        act("campaign.stop_followups"),
        act("lead.add_tag", { tag: "interested" }),
        act("lead.update_field", { field: "status", value: "interested" }),
        act("notify.internal", { title: "Interested reply", message: "{{lead.email}} replied positively" }),
      ]),
  },
  {
    id: "sales-handoff",
    name: "Interested lead → Sales handoff",
    description: "Mark interested, create a CRM task, log activity and notify the team.",
    category: "Sales",
    trigger: "reply.positive",
    build: () =>
      wf([
        act("lead.update_field", { field: "status", value: "interested" }),
        act("lead.assign_owner", { ownerId: "" }, "Assign owner"),
        act("task.create", { title: "Follow up with {{lead.first_name}} at {{lead.company}}", dueInDays: 1 }),
        act("crm.activity", { detail: "Handed off to sales by automation" }),
        act("notify.internal", { title: "New sales handoff", message: "{{lead.email}} is ready for follow-up" }),
      ]),
  },
  {
    id: "high-intent",
    name: "High-intent lead",
    description: "Positive reply from a high-value deal: tag as qualified, assign and create a priority task.",
    category: "Lead Qualification",
    trigger: "reply.positive",
    build: () =>
      wf([
        { id: newId(), type: "condition", label: "Deal value over 1,000", group: { match: "all", rules: [{ field: "lead.deal_value", operator: "gt", value: "1000" }] } },
        act("lead.add_tag", { tag: "qualified" }),
        act("lead.assign_owner", { ownerId: "" }, "Assign sales owner"),
        act("task.create", { title: "HIGH PRIORITY: call {{lead.first_name}}", dueInDays: 0 }),
      ]),
  },
  {
    id: "meeting-booked",
    name: "Meeting booked",
    description: "Stop the campaign, move to Meeting Booked, log activity and notify the team.",
    category: "Meetings",
    trigger: "meeting.booked",
    build: () =>
      wf([
        act("campaign.stop_followups"),
        act("crm.move_stage", { stageKey: "meeting_booked" }, "Move to Meeting Booked"),
        act("crm.activity", { detail: "Meeting booked" }),
        act("notify.internal", { title: "Meeting booked", message: "{{lead.email}} booked a meeting" }),
      ]),
  },
  {
    id: "no-reply-followup",
    name: "No reply → Follow-up check",
    description: "Three days after a lead enters a campaign, stop if they replied, otherwise tag for follow-up.",
    category: "Campaigns",
    trigger: "lead.entered_campaign",
    build: () =>
      wf([
        wait("days", 3),
        {
          id: newId(),
          type: "branch",
          label: "Has replied?",
          paths: [
            {
              key: "yes",
              label: "Replied",
              when: { match: "all", rules: [{ field: "activity.replies", operator: "gt", value: "0" }] },
              steps: [act("campaign.stop_followups")],
            },
          ],
          otherwise: { key: "otherwise", label: "No reply", steps: [act("lead.add_tag", { tag: "no-reply-3d" })] },
        },
      ]),
  },
  {
    id: "unsubscribe-protection",
    name: "Unsubscribe protection",
    description: "Mark the lead unsubscribed, stop every follow-up and tag it.",
    category: "Email Engagement",
    trigger: "lead.unsubscribed",
    build: () =>
      wf([
        act("lead.update_field", { field: "status", value: "unsubscribed" }),
        act("campaign.stop_followups"),
        act("campaign.pause_enrollment"),
        act("lead.add_tag", { tag: "unsubscribed" }),
      ]),
  },
  {
    id: "bounce-protection",
    name: "Bounce protection",
    description: "Mark the lead bounced, stop the campaign for them and tag it.",
    category: "Email Engagement",
    trigger: "email.bounced",
    build: () =>
      wf([
        act("lead.update_field", { field: "status", value: "bounced" }),
        act("campaign.stop_followups"),
        act("lead.add_tag", { tag: "bounced" }),
      ]),
  },
  {
    id: "cold-reengage",
    name: "Cold lead re-engagement",
    description: "When a campaign completes, wait 30 days; if the lead never replied, notify the owner to re-engage.",
    category: "Lead Management",
    trigger: "campaign.completed",
    build: () =>
      wf([
        wait("days", 30),
        { id: newId(), type: "condition", label: "Never replied", group: { match: "all", rules: [{ field: "activity.has_replied", operator: "is", value: "no" }] } },
        act("lead.add_tag", { tag: "re-engage" }),
        act("notify.internal", { title: "Re-engagement candidate", message: "{{lead.email}} has been quiet for 30 days" }),
      ]),
  },
  {
    id: "new-lead-campaign",
    name: "New lead → Add to campaign",
    description: "Enroll every new lead into a campaign you choose.",
    category: "Lead Management",
    trigger: "lead.created",
    build: () => wf([act("campaign.add", { campaignId: "" })]),
  },
];
