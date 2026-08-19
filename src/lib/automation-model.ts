/**
 * Client-safe types and catalog for the Automations system.
 *
 * Every trigger, condition field and action listed here is backed by real
 * server-side execution in `automation-engine.server.ts`. Nothing in this
 * catalog is decorative: if the backend cannot execute it, it is not here.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AutomationStatus = "draft" | "active" | "paused" | "archived";
export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export type StepKind = "condition" | "action" | "wait" | "branch";

export type AutomationRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  trigger_type: string;
  trigger_config: JsonObject;
  condition_logic: "and" | "or";
  version: number;
  webhook_token: string | null;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationStep = {
  id: string;
  automation_id: string;
  workspace_id: string;
  position: number;
  kind: StepKind;
  branch: "yes" | "no" | null;
  config: JsonObject;
};

export type AutomationRun = {
  id: string;
  automation_id: string;
  workspace_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  trigger_type: string;
  status: RunStatus;
  current_step: number;
  resume_at: string | null;
  attempts: number;
  error: string | null;
  result: string | null;
  metadata: JsonObject;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type AutomationRunStep = {
  id: string;
  run_id: string;
  position: number;
  kind: string;
  label: string;
  status: "running" | "completed" | "skipped" | "waiting" | "failed";
  output: JsonObject;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type AutomationListItem = AutomationRow & {
  steps: number;
  runs: number;
  successful: number;
  failed: number;
  waiting: number;
};

export type AutomationStats = {
  total: number;
  active: number;
  paused: number;
  drafts: number;
  archived: number;
  runs: number;
  successful: number;
  failed: number;
  waiting: number;
};

/* ------------------------------------------------------------- triggers */

export type TriggerDef = {
  id: string;
  label: string;
  group: string;
  description: string;
  /** Source that actually emits the event, shown in the builder. */
  source: string;
};

export const TRIGGERS: TriggerDef[] = [
  { id: "lead.created", label: "Lead added", group: "Leads", description: "A lead is created or imported into the workspace.", source: "Leads" },
  { id: "lead.entered_campaign", label: "Lead enters campaign", group: "Campaigns", description: "A lead is enrolled as a campaign recipient.", source: "Campaigns" },
  { id: "campaign.started", label: "Campaign started", group: "Campaigns", description: "A campaign is launched.", source: "Campaigns" },
  { id: "campaign.completed", label: "Campaign completed", group: "Campaigns", description: "A campaign finishes its sequence.", source: "Campaigns" },
  { id: "email.sent", label: "Email sent", group: "Email", description: "A campaign email is accepted by the sending provider.", source: "Sending engine" },
  { id: "email.delivered", label: "Email delivered", group: "Email", description: "The provider confirms delivery.", source: "Delivery webhooks" },
  { id: "email.bounced", label: "Email bounced", group: "Email", description: "The provider reports a bounce.", source: "Delivery webhooks" },
  { id: "email.opened", label: "Email opened", group: "Email", description: "A tracked open is recorded.", source: "Delivery webhooks" },
  { id: "email.clicked", label: "Email clicked", group: "Email", description: "A tracked link click is recorded.", source: "Delivery webhooks" },
  { id: "lead.replied", label: "Lead replied", group: "Inbox", description: "A real inbound reply lands in the Unified Inbox.", source: "Unified Inbox" },
  { id: "reply.positive", label: "Positive reply detected", group: "Inbox", description: "An inbound reply is classified as interested.", source: "Unified Inbox" },
  { id: "lead.unsubscribed", label: "Lead unsubscribed", group: "Inbox", description: "An unsubscribe signal is received.", source: "Delivery webhooks / Inbox" },
  { id: "lead.status_changed", label: "Lead status changed", group: "Leads", description: "A lead's status field changes.", source: "Leads / CRM" },
  { id: "crm.stage_changed", label: "CRM stage changed", group: "CRM", description: "A contact moves to another pipeline stage.", source: "CRM" },
  { id: "task.completed", label: "Task completed", group: "CRM", description: "A CRM task is marked done.", source: "CRM tasks" },
  { id: "meeting.booked", label: "Meeting booked", group: "Meetings", description: "A real Calendly booking webhook is received.", source: "Calendly webhook" },
  { id: "meeting.cancelled", label: "Meeting cancelled", group: "Meetings", description: "A real Calendly cancellation webhook is received.", source: "Calendly webhook" },
  { id: "mailbox.connected", label: "Email account connected", group: "Infrastructure", description: "A mailbox passes its connection test.", source: "Email Accounts" },
  { id: "warmup.status_changed", label: "Warmup status changed", group: "Infrastructure", description: "A mailbox warmup status changes.", source: "Warmup engine" },
  { id: "webhook.received", label: "Webhook received", group: "Webhooks", description: "A signed request hits this automation's own endpoint.", source: "Inbound webhook" },
];

export function triggerLabel(id: string): string {
  return TRIGGERS.find((t) => t.id === id)?.label ?? id;
}

/* ----------------------------------------------------------- conditions */

export type ConditionField = {
  id: string;
  label: string;
  group: string;
  type: "text" | "number" | "tags" | "select";
  options?: string[];
};

export const CONDITION_FIELDS: ConditionField[] = [
  { id: "lead.email", label: "Lead email", group: "Lead", type: "text" },
  { id: "lead.first_name", label: "First name", group: "Lead", type: "text" },
  { id: "lead.last_name", label: "Last name", group: "Lead", type: "text" },
  { id: "lead.company", label: "Company", group: "Lead", type: "text" },
  { id: "lead.job_title", label: "Job title", group: "Lead", type: "text" },
  { id: "lead.industry", label: "Industry", group: "Lead", type: "text" },
  { id: "lead.country", label: "Country", group: "Lead", type: "text" },
  { id: "lead.city", label: "City", group: "Lead", type: "text" },
  { id: "lead.tags", label: "Tags", group: "Lead", type: "tags" },
  { id: "lead.status", label: "Lead status", group: "Lead", type: "text" },
  { id: "lead.lead_source", label: "Lead source", group: "Lead", type: "text" },
  { id: "lead.deal_value", label: "Deal value", group: "Lead", type: "number" },
  { id: "crm.stage", label: "CRM stage", group: "CRM", type: "text" },
  { id: "crm.open_tasks", label: "Open tasks", group: "CRM", type: "number" },
  { id: "campaign.name", label: "Campaign name", group: "Campaign", type: "text" },
  { id: "campaign.status", label: "Campaign status", group: "Campaign", type: "text" },
  { id: "activity.emails_sent", label: "Emails sent to lead", group: "Email activity", type: "number" },
  { id: "activity.opens", label: "Opens", group: "Email activity", type: "number" },
  { id: "activity.clicks", label: "Clicks", group: "Email activity", type: "number" },
  { id: "activity.replies", label: "Replies", group: "Email activity", type: "number" },
  { id: "activity.bounced", label: "Bounced", group: "Email activity", type: "number" },
  { id: "reply.sentiment", label: "Reply sentiment", group: "Reply", type: "select", options: ["positive", "neutral", "negative", "out_of_office"] },
  { id: "mailbox.email", label: "Email account", group: "Infrastructure", type: "text" },
  { id: "mailbox.warmup_status", label: "Warmup status", group: "Infrastructure", type: "text" },
  { id: "meeting.status", label: "Meeting status", group: "Meetings", type: "text" },
  { id: "event.type", label: "Trigger event type", group: "Event", type: "text" },
];

export const OPERATORS = [
  { id: "equals", label: "Equals" },
  { id: "not_equals", label: "Does not equal" },
  { id: "contains", label: "Contains" },
  { id: "not_contains", label: "Does not contain" },
  { id: "is_empty", label: "Is empty" },
  { id: "is_not_empty", label: "Is not empty" },
  { id: "greater_than", label: "Greater than" },
  { id: "less_than", label: "Less than" },
] as const;

export type OperatorId = (typeof OPERATORS)[number]["id"];

export type ConditionConfig = {
  field: string;
  operator: OperatorId;
  value?: string;
};

export function needsValue(operator: OperatorId) {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

/* -------------------------------------------------------------- actions */

export type ActionDef = {
  id: string;
  label: string;
  group: string;
  description: string;
  fields: { id: string; label: string; type: "text" | "number" | "select" | "textarea"; options?: string[]; placeholder?: string }[];
};

export const ACTIONS: ActionDef[] = [
  {
    id: "campaign.add",
    label: "Add lead to campaign",
    group: "Campaigns",
    description: "Enrolls the lead as a recipient. Suppressed, unsubscribed and bounced leads are skipped.",
    fields: [{ id: "campaignId", label: "Campaign", type: "select", options: [] }],
  },
  {
    id: "campaign.remove",
    label: "Remove lead from campaign",
    group: "Campaigns",
    description: "Removes the recipient and cancels any queued email for that lead.",
    fields: [{ id: "campaignId", label: "Campaign", type: "select", options: [] }],
  },
  {
    id: "campaign.stop_followups",
    label: "Stop campaign follow-ups",
    group: "Campaigns",
    description: "Cancels every pending and scheduled email for this lead across the campaign.",
    fields: [],
  },
  {
    id: "campaign.pause_enrollment",
    label: "Pause campaign enrollment",
    group: "Campaigns",
    description: "Stops this lead from receiving any further enrollment in the campaign.",
    fields: [],
  },
  {
    id: "crm.move_stage",
    label: "Move CRM stage",
    group: "CRM",
    description: "Moves the contact in the real pipeline and logs the change.",
    fields: [{ id: "stageId", label: "Stage", type: "select", options: [] }],
  },
  { id: "lead.add_tag", label: "Add tag", group: "CRM", description: "Adds a tag to the lead record.", fields: [{ id: "tag", label: "Tag", type: "text", placeholder: "interested" }] },
  { id: "lead.remove_tag", label: "Remove tag", group: "CRM", description: "Removes a tag from the lead record.", fields: [{ id: "tag", label: "Tag", type: "text", placeholder: "cold" }] },
  {
    id: "task.create",
    label: "Create task",
    group: "CRM",
    description: "Creates a real CRM task on the contact.",
    fields: [
      { id: "title", label: "Task title", type: "text", placeholder: "Follow up on reply" },
      { id: "dueInDays", label: "Due in (days)", type: "number", placeholder: "1" },
    ],
  },
  {
    id: "lead.update_field",
    label: "Update lead field",
    group: "CRM",
    description: "Writes a value to an editable lead field.",
    fields: [
      { id: "field", label: "Field", type: "select", options: ["status", "company", "job_title", "industry", "lead_source", "deal_value", "phone", "website", "city", "country"] },
      { id: "value", label: "Value", type: "text" },
    ],
  },
  { id: "lead.assign_owner", label: "Assign owner", group: "CRM", description: "Assigns a workspace member as the contact owner.", fields: [{ id: "ownerId", label: "Owner", type: "select", options: [] }] },
  { id: "crm.activity", label: "Create CRM activity", group: "CRM", description: "Writes an entry into the contact's activity timeline.", fields: [{ id: "detail", label: "Activity detail", type: "text", placeholder: "Automation logged an update" }] },
  {
    id: "notify.internal",
    label: "Send internal notification",
    group: "Notifications",
    description: "Sends an in-app notification to every workspace member.",
    fields: [
      { id: "title", label: "Title", type: "text", placeholder: "Automation alert" },
      { id: "message", label: "Message", type: "textarea" },
    ],
  },
  {
    id: "notify.slack",
    label: "Send Slack notification",
    group: "Notifications",
    description: "Delivers through the connected Slack integration. Skipped when Slack is not connected.",
    fields: [{ id: "message", label: "Message", type: "textarea", placeholder: "{{lead.email}} replied" }],
  },
  {
    id: "webhook.send",
    label: "Send webhook",
    group: "Webhooks",
    description: "POSTs the run context to your URL, signed with an HMAC header.",
    fields: [{ id: "url", label: "Endpoint URL", type: "text", placeholder: "https://example.com/hooks/sendloop" }],
  },
  {
    id: "wait",
    label: "Wait",
    group: "Flow",
    description: "Pauses the run in the database and resumes it from the backend worker.",
    fields: [],
  },
  { id: "end", label: "End automation", group: "Flow", description: "Completes the run immediately.", fields: [] },
];

export function actionDef(id: string) {
  return ACTIONS.find((a) => a.id === id);
}

export function actionLabel(id: string): string {
  return actionDef(id)?.label ?? id;
}

/* ----------------------------------------------------------------- wait */

export type WaitConfig = {
  mode: "minutes" | "hours" | "days" | "until_time" | "business_hours";
  amount?: number;
  /** "HH:MM" in the workspace timezone. */
  time?: string;
};

export const WAIT_MODES = [
  { id: "minutes", label: "Wait X minutes" },
  { id: "hours", label: "Wait X hours" },
  { id: "days", label: "Wait X days" },
  { id: "until_time", label: "Wait until specific time" },
  { id: "business_hours", label: "Wait until business hours" },
] as const;

export function describeWait(config: WaitConfig): string {
  switch (config.mode) {
    case "until_time":
      return `Wait until ${config.time ?? "09:00"}`;
    case "business_hours":
      return "Wait until business hours";
    default:
      return `Wait ${config.amount ?? 1} ${config.mode}`;
  }
}

export function describeStep(step: { kind: StepKind; config: Record<string, unknown> }): string {
  if (step.kind === "condition" || step.kind === "branch") {
    const c = step.config as unknown as ConditionConfig;
    const field = CONDITION_FIELDS.find((f) => f.id === c.field)?.label ?? c.field ?? "field";
    const op = OPERATORS.find((o) => o.id === c.operator)?.label ?? c.operator;
    return needsValue(c.operator) ? `${field} ${op?.toLowerCase()} "${c.value ?? ""}"` : `${field} ${op?.toLowerCase()}`;
  }
  if (step.kind === "wait") return describeWait(step.config as unknown as WaitConfig);
  const type = String((step.config as { type?: string }).type ?? "");
  return actionLabel(type);
}

/* -------------------------------------------------------------- templates */

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  steps: { kind: StepKind; config: Record<string, unknown>; branch?: "yes" | "no" }[];
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "reply-stop",
    name: "Reply → Stop follow-ups",
    description: "The moment a prospect replies, cancel every queued follow-up for that lead.",
    trigger: "lead.replied",
    steps: [{ kind: "action", config: { type: "campaign.stop_followups" } }],
  },
  {
    id: "positive-interested",
    name: "Positive reply → Move to Interested",
    description: "Route interested replies into the right pipeline stage and tag them.",
    trigger: "reply.positive",
    steps: [
      { kind: "action", config: { type: "campaign.stop_followups" } },
      { kind: "action", config: { type: "lead.add_tag", tag: "interested" } },
      { kind: "action", config: { type: "lead.update_field", field: "status", value: "interested" } },
    ],
  },
  {
    id: "meeting-booked",
    name: "Meeting booked → Move to Meeting Booked",
    description: "A real Calendly booking updates the pipeline and stops outreach.",
    trigger: "meeting.booked",
    steps: [
      { kind: "action", config: { type: "campaign.stop_followups" } },
      { kind: "action", config: { type: "lead.update_field", field: "status", value: "meeting_booked" } },
      { kind: "action", config: { type: "crm.activity", detail: "Meeting booked via Calendly" } },
    ],
  },
  {
    id: "new-lead-campaign",
    name: "New lead → Add to campaign",
    description: "Automatically enroll new leads into your evergreen sequence.",
    trigger: "lead.created",
    steps: [
      { kind: "wait", config: { mode: "business_hours" } },
      { kind: "action", config: { type: "campaign.add", campaignId: "" } },
    ],
  },
  {
    id: "bounce-invalid",
    name: "Bounce → Mark lead invalid",
    description: "Bounced addresses are tagged, marked and removed from further sending.",
    trigger: "email.bounced",
    steps: [
      { kind: "action", config: { type: "lead.update_field", field: "status", value: "bounced" } },
      { kind: "action", config: { type: "lead.add_tag", tag: "invalid-email" } },
      { kind: "action", config: { type: "campaign.stop_followups" } },
    ],
  },
  {
    id: "unsub-stop",
    name: "Unsubscribe → Stop outreach",
    description: "Honour opt-outs across the workspace immediately.",
    trigger: "lead.unsubscribed",
    steps: [
      { kind: "action", config: { type: "campaign.stop_followups" } },
      { kind: "action", config: { type: "campaign.pause_enrollment" } },
    ],
  },
  {
    id: "reply-task",
    name: "New reply → Create CRM task",
    description: "Never lose a reply: create a follow-up task on the contact.",
    trigger: "lead.replied",
    steps: [{ kind: "action", config: { type: "task.create", title: "Follow up on reply", dueInDays: 1 } }],
  },
  {
    id: "meeting-activity",
    name: "Meeting booked → Create CRM activity",
    description: "Log every booking on the contact timeline and notify the team.",
    trigger: "meeting.booked",
    steps: [
      { kind: "action", config: { type: "crm.activity", detail: "Meeting booked" } },
      { kind: "action", config: { type: "notify.internal", title: "Meeting booked", message: "A prospect booked a meeting." } },
    ],
  },
];

/* ------------------------------------------------------------- helpers */

export const RUN_STATUS_TONE: Record<RunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/12 text-primary",
  waiting: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  failed: "bg-destructive/12 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export const AUTOMATION_STATUS_TONE: Record<AutomationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  archived: "bg-muted text-muted-foreground",
};
