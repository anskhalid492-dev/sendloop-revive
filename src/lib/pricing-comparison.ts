import type { Plan } from "@/lib/plans.functions";

export type ComparisonValue = boolean | string;

export type PricingComparisonRow = {
  label: string;
  description: string;
  value: (plan: Plan) => ComparisonValue;
};

export type PricingComparisonCategory = {
  name: string;
  rows: PricingComparisonRow[];
};

const included = () => true;

const number = (value: number | null | undefined, suffix = "") =>
  value === null || value === undefined || value < 0
    ? "Unlimited"
    : `${value.toLocaleString()}${suffix}`;

function keyedFeature(plan: Plan, key: string) {
  return plan.features.find((feature) => feature.feature_key === key)?.included ?? false;
}

function keyedValue(plan: Plan, key: string): ComparisonValue {
  const feature = plan.features.find((item) => item.feature_key === key);
  if (!feature?.included) return false;
  return feature.value || true;
}

const campaignFeature = (plan: Plan) => keyedFeature(plan, "campaigns");
const crmFeature = (plan: Plan) => keyedFeature(plan, "crm");
const automationFeature = (plan: Plan) => keyedFeature(plan, "automations");
const integrationsFeature = (plan: Plan) => keyedFeature(plan, "integrations");
const aiPersonalization = (plan: Plan) => keyedFeature(plan, "ai_personalization");
const aiWriter = (plan: Plan) => keyedValue(plan, "ai_campaign_writer");
const monthlyEmails = (plan: Plan) =>
  `${number(plan.max_emails_monthly)}${plan.monthly_price === 0 ? " total" : " / month"}`;

export const PRICING_COMPARISON: PricingComparisonCategory[] = [
  {
    name: "Workspace & Account",
    rows: [
      { label: "Workspaces", description: "Separate workspaces for teams, clients or brands.", value: (plan) => number(plan.max_workspaces) },
      { label: "Team members", description: "People who can collaborate in the account.", value: (plan) => number(plan.max_users) },
      { label: "Workspace roles", description: "Role-based access for invited teammates.", value: (plan) => (plan.max_users ?? 0) > 1 },
      { label: "Usage dashboard", description: "Current plan usage, limits and over-limit warnings.", value: included },
    ],
  },
  {
    name: "Leads & Contacts",
    rows: [
      { label: "Stored leads", description: "Maximum lead and contact records stored in the workspace.", value: (plan) => number(plan.max_leads) },
      { label: "Lead lists", description: "Group contacts into reusable campaign lists.", value: included },
      { label: "CSV imports", description: "Upload mapped lead files with validation and duplicate checks.", value: included },
      { label: "Duplicate protection", description: "Avoid creating repeated contacts during import and manual entry.", value: included },
      { label: "Unsubscribe suppression", description: "Keep unsubscribed or suppressed recipients out of future sends.", value: included },
      { label: "Contact notes", description: "Save notes and activity history on contact records.", value: crmFeature },
    ],
  },
  {
    name: "Campaigns & Sequences",
    rows: [
      { label: "Campaigns", description: "Create and manage outbound email campaigns.", value: (plan) => number(plan.max_campaigns) },
      { label: "Active campaigns", description: "Campaigns that can run at the same time.", value: (plan) => number(plan.max_active_campaigns) },
      { label: "Email sequences", description: "Build multi-step sequences for each campaign.", value: campaignFeature },
      { label: "Automated follow-ups", description: "Send follow-up steps on the configured schedule.", value: campaignFeature },
      { label: "Campaign scheduling", description: "Choose sending days, windows and campaign timing.", value: campaignFeature },
      { label: "Monthly email sends", description: "Plan allowance for campaign sends, follow-ups and replies.", value: monthlyEmails },
      { label: "Daily send cap", description: "Plan-wide daily send cap where configured, alongside mailbox-level safety limits.", value: (plan) => number(plan.max_emails_daily, " / day") },
      { label: "Workflow automations", description: "Trigger, condition and action workflows for outreach operations.", value: (plan) => automationFeature(plan) ? number(plan.max_automations) : false },
    ],
  },
  {
    name: "Email Accounts & Sending",
    rows: [
      { label: "Email accounts", description: "Connected mailboxes available for sending.", value: (plan) => number(plan.max_sending_accounts) },
      { label: "Mailbox authentication", description: "Connection checks for the mailbox used to send.", value: included },
      { label: "Sending limits", description: "Plan and mailbox limits enforced before messages are sent.", value: included },
      { label: "Bounce handling", description: "Hard bounces are recorded and protected from repeat sending.", value: included },
      { label: "Complaint handling", description: "Complaints and sender-policy blocks are handled as safety events.", value: included },
      { label: "Per-mailbox signatures", description: "Rich and plain-text signatures for connected mailboxes.", value: included },
      { label: "Managed email sending", description: "Campaign delivery runs through the MunchReach sending workflow.", value: included },
    ],
  },
  {
    name: "AI & Personalization",
    rows: [
      { label: "AI Writer", description: "Draft and rewrite campaign emails inside the campaign builder.", value: aiWriter },
      { label: "AI personalization", description: "Generate personalized campaign lines for leads.", value: aiPersonalization },
      { label: "Personalized variables", description: "Insert lead, campaign and sender variables into message content.", value: campaignFeature },
      { label: "Bulk personalization", description: "Queue personalization work across campaign recipients.", value: aiPersonalization },
      { label: "AI allowance", description: "Plan allowance for metered AI personalization work.", value: (plan) => aiPersonalization(plan) ? number(plan.max_ai_monthly, " / month") : false },
      { label: "AI integrations", description: "Connect supported AI providers for workspace AI features.", value: integrationsFeature },
    ],
  },
  {
    name: "Inbox & CRM",
    rows: [
      { label: "Unified inbox", description: "Read and respond to prospect conversations in one inbox.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Threaded conversations", description: "Keep inbound and outbound messages together by contact.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Campaign reply matching", description: "Attribute genuine campaign replies back to the right recipient.", value: (plan) => plan.unified_inbox_enabled },
      { label: "CRM pipeline", description: "Move contacts through built-in pipeline stages.", value: crmFeature },
      { label: "Contact tasks", description: "Create and manage follow-up tasks for leads.", value: crmFeature },
      { label: "Reply classification", description: "Classify replies by outcome and intent.", value: (plan) => plan.unified_inbox_enabled },
    ],
  },
  {
    name: "Analytics",
    rows: [
      { label: "Analytics dashboard", description: "Workspace reporting for outreach performance.", value: (plan) => plan.analytics_enabled },
      { label: "Sent and reached metrics", description: "Track sent, reached and delivered-email outcomes.", value: (plan) => plan.analytics_enabled },
      { label: "Open tracking", description: "Measure recorded opens where tracking is enabled.", value: (plan) => plan.analytics_enabled },
      { label: "Reply tracking", description: "Measure campaign replies and response outcomes.", value: (plan) => plan.analytics_enabled },
      { label: "Bounce reporting", description: "Review hard and soft bounce outcomes.", value: (plan) => plan.analytics_enabled },
      { label: "Warmup analytics", description: "Review mailbox warmup health and activity separately from campaign metrics.", value: (plan) => plan.analytics_enabled && plan.warmup_enabled },
    ],
  },
  {
    name: "Mailboxes",
    rows: [
      { label: "Google mailboxes", description: "Connect supported Google or Gmail accounts.", value: included },
      { label: "Microsoft mailboxes", description: "Connect supported Outlook or Microsoft 365 accounts.", value: included },
      { label: "IMAP and SMTP mailboxes", description: "Connect other authorized mailboxes with standard credentials.", value: included },
      { label: "Mailbox health checks", description: "Monitor connection, authentication and sending-health status.", value: included },
      { label: "Mailbox warmup", description: "Staged warmup for connected mailboxes.", value: (plan) => plan.warmup_enabled },
      { label: "Mailbox pause controls", description: "Pause individual sending accounts when needed.", value: included },
    ],
  },
  {
    name: "Integrations",
    rows: [
      { label: "API access", description: "Use workspace API keys with the MunchReach API.", value: (plan) => plan.api_access },
      { label: "Webhooks", description: "Send supported workspace events to connected tools.", value: integrationsFeature },
      { label: "Slack", description: "Send selected campaign and reply notifications to Slack.", value: integrationsFeature },
      { label: "Zapier", description: "Connect supported events and lead actions through Zapier.", value: integrationsFeature },
      { label: "Make", description: "Connect supported events and lead actions through Make.", value: integrationsFeature },
      { label: "CRM integrations", description: "Sync supported contact, reply and activity data with connected CRMs.", value: integrationsFeature },
    ],
  },
  {
    name: "Support & Billing",
    rows: [
      { label: "Help Center", description: "Access practical product guides and setup instructions.", value: included },
      { label: "Support tickets", description: "Open and follow support requests from the workspace.", value: included },
      { label: "Subscription management", description: "Manage plan changes and cancellation from billing settings.", value: included },
      { label: "Invoices", description: "Review invoices when available from the active billing provider.", value: included },
      { label: "Priority support", description: "Fast-lane support handling.", value: (plan) => plan.priority_support },
      { label: "Custom branding", description: "Use supported workspace branding controls.", value: (plan) => plan.custom_branding },
      { label: "SSO / SAML", description: "Single sign-on for workspace access.", value: (plan) => plan.sso_enabled },
    ],
  },
];