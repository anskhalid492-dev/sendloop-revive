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
  value === null || value === undefined
    ? "Unlimited"
    : `${value.toLocaleString()}${suffix}`;

function keyedFeature(plan: Plan, key: string) {
  return plan.features.find((feature) => feature.feature_key === key)?.included ?? false;
}

function displayFeature(plan: Plan, name: string) {
  return plan.features.find((feature) => !feature.feature_key && feature.name === name);
}

function featureValue(plan: Plan, name: string, fallback: ComparisonValue) {
  const feature = displayFeature(plan, name);
  if (!feature) return fallback;
  if (!feature.included) return false;
  return feature.value || true;
}

const campaignFeature = (plan: Plan) => keyedFeature(plan, "campaigns");
const crmFeature = (plan: Plan) => keyedFeature(plan, "crm");
const automationFeature = (plan: Plan) => keyedFeature(plan, "automations");
const integrationsFeature = (plan: Plan) => keyedFeature(plan, "integrations");
const aiPersonalization = (plan: Plan) => keyedFeature(plan, "ai_personalization");
const aiWriter = (plan: Plan) => {
  const feature = plan.features.find((item) => item.feature_key === "ai_campaign_writer");
  if (!feature?.included) return false;
  return feature.value || true;
};

export const PRICING_COMPARISON: PricingComparisonCategory[] = [
  {
    name: "Workspace & account",
    rows: [
      { label: "Workspaces", description: "Separate spaces for teams, clients or brands.", value: (plan) => number(plan.max_workspaces) },
      { label: "Team members", description: "People who can collaborate in a workspace.", value: (plan) => number(plan.max_users) },
      { label: "Roles & permissions", description: "Workspace access levels for team members.", value: (plan) => featureValue(plan, "Roles & permissions", plan.max_users > 1) },
      { label: "Multiple workspaces", description: "Manage more than one workspace from the same account.", value: (plan) => plan.max_workspaces === null || plan.max_workspaces > 1 },
    ],
  },
  {
    name: "Leads & contacts",
    rows: [
      { label: "Lead/contact management", description: "Create, update and manage prospect records.", value: included },
      { label: "Lead capacity", description: "Maximum contacts stored in each workspace.", value: (plan) => number(plan.max_leads) },
      { label: "CSV import", description: "Import mapped lead files with validation and duplicate checks.", value: included },
      { label: "CSV export", description: "Download selected contacts and their current details.", value: included },
      { label: "Lead lists", description: "Group contacts into reusable lists.", value: included },
      { label: "Contact organization", description: "Use statuses, tags, notes and CRM stages.", value: included },
      { label: "Lead/contact filtering", description: "Filter and select contacts by their saved attributes.", value: included },
      { label: "Lead suppression", description: "Prevent future sends to suppressed contacts.", value: included },
      { label: "Duplicate protection", description: "Detect duplicate email addresses during import and creation.", value: included },
    ],
  },
  {
    name: "Campaigns & sequences",
    rows: [
      { label: "Campaigns", description: "Build and manage outbound email campaigns.", value: (plan) => plan.max_campaigns === null ? "Unlimited" : number(plan.max_campaigns) },
      { label: "Active campaigns", description: "Campaigns that can run at the same time.", value: (plan) => plan.max_active_campaigns === null ? "Unlimited" : number(plan.max_active_campaigns) },
      { label: "Email sequences", description: "Create multi-step email sequences.", value: campaignFeature },
      { label: "Automated follow-ups", description: "Send later sequence steps on the configured schedule.", value: campaignFeature },
      { label: "Scheduling", description: "Choose sending days, windows and campaign timing.", value: campaignFeature },
      { label: "Sending allowance", description: "Maximum campaign and reply emails for the billing period.", value: (plan) => `${number(plan.max_emails_monthly)}${plan.monthly_price === 0 ? " total" : " / month"}` },
      { label: "Daily sending limit", description: "Plan-wide maximum emails sent in one day.", value: (plan) => number(plan.max_emails_daily, " / day") },
      { label: "Campaign analytics", description: "Review campaign delivery, engagement and outcomes.", value: (plan) => plan.analytics_enabled },
      { label: "Campaign management", description: "Pause, resume, archive and monitor campaign progress.", value: campaignFeature },
      { label: "Bulk campaign processing", description: "Apply supported campaign actions across a selection.", value: campaignFeature },
      { label: "Workflow automations", description: "Build trigger, condition and action workflows.", value: (plan) => automationFeature(plan) && (plan.max_automations === null ? "Unlimited" : number(plan.max_automations)) },
    ],
  },
  {
    name: "Email accounts & sending",
    rows: [
      { label: "Email accounts", description: "Connected mailboxes available for sending.", value: (plan) => number(plan.max_sending_accounts) },
      { label: "Multiple email accounts", description: "Connect more than one sending mailbox.", value: (plan) => plan.max_sending_accounts === null || plan.max_sending_accounts > 1 },
      { label: "Email account management", description: "Connect, test, pause and manage each mailbox.", value: included },
      { label: "Managed sending infrastructure", description: "MunchReach manages the underlying campaign delivery system.", value: included },
      { label: "Sending controls", description: "Mailbox-level limits, schedules and pause controls.", value: included },
      { label: "Mailbox/account health", description: "Connection, authentication and sending-health status.", value: included },
      { label: "Deliverability controls", description: "Bounce, complaint, unsubscribe and suppression safeguards.", value: included },
      { label: "Inbox warmup", description: "Staged mailbox warmup with health-aware controls.", value: (plan) => plan.warmup_enabled },
      { label: "Warmup daily allowance", description: "Maximum warmup messages across the plan each day.", value: (plan) => plan.warmup_enabled ? number(plan.max_warmup_daily, " / day") : false },
      { label: "Per-mailbox email signatures", description: "Create rich and plain-text signatures for connected mailboxes.", value: included },
    ],
  },
  {
    name: "AI & personalization",
    rows: [
      { label: "AI personalization", description: "Generate personalized opening lines for campaign leads.", value: aiPersonalization },
      { label: "AI provider selection", description: "Choose OpenAI or Claude for workspace AI features.", value: (plan) => aiPersonalization(plan) || Boolean(aiWriter(plan)) },
      { label: "Personalized variables", description: "Insert lead and sender variables into sequence content.", value: campaignFeature },
      { label: "Bulk personalization", description: "Queue AI personalization across campaign leads.", value: aiPersonalization },
      { label: "AI-assisted email generation", description: "Draft and rewrite campaign email content with connected AI.", value: aiWriter },
      { label: "AI Campaign Builder", description: "Create campaign strategy, messaging and complete sequences from a brief.", value: aiWriter },
      { label: "AI generations", description: "Plan allowance for AI personalization work.", value: (plan) => aiPersonalization(plan) ? number(plan.max_ai_monthly, " / month") : false },
    ],
  },
  {
    name: "Inbox & CRM",
    rows: [
      { label: "Unified inbox", description: "Read and respond to prospect email in one inbox.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Conversations", description: "Keep inbound and outbound messages together by contact.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Reply management", description: "Reply, assign status and continue a thread.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Reply classification", description: "Classify replies by outcome and intent.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Positive reply tracking", description: "Track interested replies separately from all replies.", value: (plan) => plan.unified_inbox_enabled },
      { label: "Contact activity", description: "See sends, replies, notes and stage changes on the contact.", value: crmFeature },
      { label: "CRM updates", description: "Move contacts through the built-in pipeline.", value: crmFeature },
      { label: "Conversation history", description: "Review the full stored message thread for a contact.", value: (plan) => plan.unified_inbox_enabled },
    ],
  },
  {
    name: "Analytics",
    rows: [
      { label: "Campaign analytics", description: "Campaign-level reporting and sequence performance.", value: (plan) => featureValue(plan, "Campaign analytics", plan.analytics_enabled) },
      { label: "Emails sent", description: "Track sent volume for the selected reporting period.", value: (plan) => plan.analytics_enabled },
      { label: "Deliverability metrics", description: "Review delivered, bounced and sending-health outcomes.", value: (plan) => plan.analytics_enabled },
      { label: "Opens", description: "Track recorded email opens where tracking is enabled.", value: (plan) => plan.analytics_enabled },
      { label: "Replies", description: "Measure attributed campaign replies.", value: (plan) => plan.analytics_enabled },
      { label: "Positive replies", description: "Measure replies classified as interested.", value: (plan) => plan.analytics_enabled },
      { label: "Bounces", description: "See hard and soft bounce outcomes.", value: (plan) => plan.analytics_enabled },
      { label: "Unsubscribes", description: "Track recipients who unsubscribe from outreach.", value: (plan) => plan.analytics_enabled },
      { label: "Performance reporting", description: "Compare campaign, sequence and account performance.", value: (plan) => plan.analytics_enabled },
    ],
  },
  {
    name: "Mailboxes",
    rows: [
      { label: "Google Workspace", description: "Connect Google or Gmail mailboxes with OAuth.", value: included },
      { label: "Microsoft 365", description: "Connect Outlook or Microsoft 365 mailboxes with OAuth.", value: included },
      { label: "Custom mailboxes", description: "Connect other providers using IMAP and SMTP.", value: included },
    ],
  },
  {
    name: "Integrations",
    rows: [
      { label: "OpenAI", description: "Use your own OpenAI key for supported AI features.", value: integrationsFeature },
      { label: "Claude", description: "Use your own Anthropic key for supported AI features.", value: integrationsFeature },
      { label: "Slack", description: "Send selected reply and campaign notifications to Slack.", value: integrationsFeature },
      { label: "Zapier", description: "Send events to Zaps and receive leads through a private inbound URL.", value: integrationsFeature },
      { label: "Make", description: "Send events to Make scenarios and receive leads through a private inbound URL.", value: integrationsFeature },
      { label: "HubSpot", description: "Sync supported contacts, replies and CRM activity.", value: integrationsFeature },
      { label: "GoHighLevel", description: "Send supported lead and reply activity to a connected location.", value: integrationsFeature },
      { label: "Calendly", description: "Attribute connected Calendly bookings to contacts and campaigns.", value: integrationsFeature },
      { label: "Google Sheets", description: "Append selected events through a Google Apps Script web app.", value: integrationsFeature },
      { label: "API access", description: "Use workspace API keys with the MunchReach API.", value: (plan) => plan.api_access },
    ],
  },
  {
    name: "Support & billing",
    rows: [
      { label: "Help Center", description: "Access practical product guides and setup instructions.", value: included },
      { label: "Support tickets", description: "Open and follow support requests from the workspace.", value: included },
      { label: "Support rating", description: "Rate the help received after a support interaction.", value: included },
      { label: "Priority support", description: "Fast-lane support handling.", value: (plan) => plan.priority_support },
      { label: "Subscription management", description: "Manage plan and payment details from billing.", value: included },
      { label: "Billing & invoices", description: "Review billing status and available invoices.", value: included },
      { label: "Custom branding", description: "Use supported workspace branding controls.", value: (plan) => plan.custom_branding },
      { label: "SSO / SAML", description: "Single sign-on for workspace access.", value: (plan) => plan.sso_enabled },
    ],
  },
];
