import type { HelpCategory } from "./types";

/**
 * Customer-facing categories only. There is deliberately no "Email Providers"
 * category: the services behind MunchReach's sending infrastructure are an
 * internal implementation detail and are documented for admins elsewhere.
 */
export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "getting-started",
    name: "Getting Started",
    description: "Set up your workspace, connect a mailbox and launch your first campaign.",
  },
  {
    slug: "account",
    name: "Account & Workspace",
    description: "Profile, workspace settings, teammates, roles and account security.",
  },
  {
    slug: "campaigns",
    name: "Campaigns",
    description: "Sequences, follow-ups, schedules, launch readiness and campaign statuses.",
  },
  {
    slug: "leads",
    name: "Leads & Contacts",
    description: "Lists, CSV import, mapping, filters, lead statuses and exports.",
  },
  {
    slug: "email-accounts",
    name: "Email Accounts & Mailboxes",
    description: "Connecting mailboxes, health checks, limits and reconnection.",
  },
  {
    slug: "ai",
    name: "AI & Personalization",
    description: "Personalized openers, bulk generation, review and usage limits.",
  },
  {
    slug: "claude",
    name: "Claude",
    description: "Using Claude as the model behind MunchReach AI personalization.",
  },
  {
    slug: "sending",
    name: "Sending & Scheduling",
    description: "Sending windows, limits, queues, delays and delivery behaviour.",
  },
  {
    slug: "inbox",
    name: "Inbox & Conversations",
    description: "The unified inbox, replies, threading and conversation management.",
  },
  {
    slug: "warmup",
    name: "Warmup",
    description: "How warmup ramps a mailbox, its settings, health and statuses.",
  },
  {
    slug: "analytics",
    name: "Analytics & Reporting",
    description: "Campaign metrics, the conversion funnel, drill-downs and exports.",
  },
  {
    slug: "domains",
    name: "Domains & DNS",
    description: "Domain verification, SPF, DKIM, DMARC, tracking and propagation.",
  },
  {
    slug: "deliverability",
    name: "Deliverability",
    description: "Inbox placement, reputation, bounces, spam complaints and volume.",
  },
  {
    slug: "compliance",
    name: "Compliance & Suppression",
    description: "Suppression lists, unsubscribes, bounce protection and sending restrictions.",
  },
  {
    slug: "integrations",
    name: "Integrations",
    description: "Connecting the tools you already use and managing those connections.",
  },
  {
    slug: "billing",
    name: "Billing & Subscriptions",
    description: "Plans, trials, upgrades, usage, invoices and payment problems.",
  },
  {
    slug: "api",
    name: "API & Developers",
    description: "Public API v1, authentication, endpoints, pagination and webhooks.",
  },
  {
    slug: "troubleshooting",
    name: "Troubleshooting",
    description: "Fix-it guides for the problems support sees most.",
  },
  {
    slug: "security",
    name: "Security & Privacy",
    description: "Account security, workspace isolation, API key hygiene and data access.",
  },
];
