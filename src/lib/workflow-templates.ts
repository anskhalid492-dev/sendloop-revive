/**
 * Visual workflow templates. Every template creates an editable DRAFT; nothing
 * goes live until the customer activates it. Only actions the engine really
 * executes are used, and no template sends email (AI reply steps default to draft).
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
const aiReply = (cfg: Record<string, unknown>): WorkflowNode =>
  act("ai.generate_reply", { tone: "Friendly and concise", maxWords: 120, ...cfg, mode: "draft" }, "Generate AI Reply (draft)");
const humanReview = (reason: string): WorkflowNode => act("human.review", { reason }, "Request Human Review");
const aiDecision = (question: string, outcomes: [string, WorkflowNode[]][]): WorkflowNode => ({
  id: newId(),
  type: "branch",
  label: "AI Decision",
  ai: { question, threshold: 0.8 },
  paths: outcomes.map(([label, steps]) => ({ key: `ai-${newId().slice(0, 8)}`, label, steps })),
  otherwise: { key: "otherwise", label: "Human review", steps: [humanReview("AI was not confident enough to respond automatically.")] },
});
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
    description: "30 days after a lead enters a campaign, if they never replied, tag them and notify the team to re-engage.",
    category: "Lead Management",
    trigger: "lead.entered_campaign",
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
  {
    id: "ai-sales-reply",
    name: "AI Sales Agent — Reply Handling",
    description: "When a lead replies, stop follow-ups and let AI route the reply. AI replies are saved as drafts for you to review.",
    category: "Reply Handling",
    trigger: "lead.replied",
    build: () =>
      wf([
        act("campaign.stop_followups"),
        aiDecision("What is the prospect's intent in their latest reply?", [
          ["Interested", [act("crm.move_stage", { stageKey: "replied" }, "Move to Replied"), act("lead.update_field", { field: "status", value: "interested" }, "Mark Interested"), act("task.create", { title: "Sales follow-up: {{lead.email}}", dueInDays: 1 }), aiReply({ goal: "Book a sales call" })]],
          ["Question", [aiReply({ goal: "Answer the prospect's question", instructions: "Answer the question first using only the provided context." })]],
          ["Objection", [aiReply({ goal: "Address the objection respectfully", instructions: "Acknowledge the concern, then offer a short call." })]],
          ["Not Interested", [act("campaign.pause_enrollment", {}, "Stop outreach")]],
          ["Unsubscribe", [act("lead.update_field", { field: "status", value: "unsubscribed" }, "Mark unsubscribed"), act("campaign.pause_enrollment", {}, "Stop outreach")]],
          ["Out of Office", [act("lead.add_tag", { tag: "out-of-office" }, "Tag out of office")]],
          ["Other", [humanReview("AI could not classify this reply.")]],
        ]),
      ]),
  },
  {
    id: "ai-sales-objection",
    name: "AI Sales Agent — Objection Handling",
    description: "Detect the type of objection and draft a suggested response. Nothing is sent automatically.",
    category: "Reply Handling",
    trigger: "lead.replied",
    build: () =>
      wf([
        aiDecision(
          "Which objection is the prospect raising in their latest reply?",
          ["Price", "Timing", "Already have provider", "Not interested", "Need more information", "Need approval", "Competitor", "Other"].map(
            (o) => [o, o === "Not interested" ? [act("campaign.pause_enrollment", {}, "Stop outreach")] : o === "Other" ? [humanReview("Objection needs a person.")] : [aiReply({ goal: `Respond to a "${o.toLowerCase()}" objection`, instructions: "Acknowledge the concern honestly. Never invent pricing, discounts or features." })]] as [string, WorkflowNode[]],
          ),
        ),
      ]),
  },
  {
    id: "ai-sales-qualification",
    name: "AI Sales Agent — Lead Qualification",
    description: "AI reads the conversation and sorts the lead by intent. High intent moves to Qualified with a drafted reply.",
    category: "Lead Qualification",
    trigger: "lead.replied",
    build: () =>
      wf([
        aiDecision("How strong is the buying intent in this conversation?", [
          ["High intent", [act("crm.move_stage", { stageKey: "replied" }, "Move to Replied"), act("lead.add_tag", { tag: "qualified" }, "Tag Qualified"), act("task.create", { title: "High-intent lead: {{lead.email}}", dueInDays: 1 }), aiReply({ goal: "Book a sales call" })]],
          ["Medium intent", [act("lead.add_tag", { tag: "interested" }, "Keep Interested"), aiReply({ goal: "Move the conversation forward" })]],
          ["Low intent", []],
          ["Unclear", [humanReview("AI could not tell the lead's intent.")]],
        ]),
      ]),
  },
];
