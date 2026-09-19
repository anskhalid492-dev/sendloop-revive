import { getArticle, type HelpArticle } from "./help-center";

export const SUPPORT_START_HERE = [
  "quick-start",
  "connect-a-mailbox",
  "verify-a-domain",
  "import-leads",
  "create-a-campaign",
  "launch-first-campaign",
] as const;

export const SUPPORT_GUIDE_GROUPS = [
  {
    slug: "getting-started",
    label: "Getting Started",
    articles: ["quick-start", "how-munchreach-works", "connect-a-mailbox", "verify-a-domain", "import-leads", "create-a-campaign", "create-follow-ups", "launch-first-campaign"],
  },
  {
    slug: "campaigns",
    label: "Campaigns",
    articles: ["add-leads-to-campaign", "configure-sending-days", "configure-sending-hours", "campaign-timezone", "sending-limits", "pause-resume-stop-campaign", "why-campaign-not-sending"],
  },
  {
    slug: "leads",
    label: "Leads",
    articles: ["csv-import-guide", "csv-column-mapping", "why-import-skipped-rows", "filter-leads", "export-leads", "suppressed-leads"],
  },
  {
    slug: "email-accounts",
    label: "Mailboxes",
    articles: ["connect-a-mailbox", "mailbox-health", "assign-mailboxes-to-campaigns", "mailbox-limits", "mailbox-troubleshooting"],
  },
  {
    slug: "ai",
    label: "AI",
    articles: ["ai-personalization-overview", "how-ai-personalization-works", "generate-opening-lines", "bulk-ai-personalization", "ai-troubleshooting", "claude-overview", "connect-claude"],
  },
  {
    slug: "sending",
    label: "Sending",
    articles: ["how-sending-works", "sending-window", "sending-pacing", "follow-up-scheduling", "why-campaign-not-sending", "sending-troubleshooting"],
  },
  {
    slug: "inbox",
    label: "Inbox",
    articles: ["inbox-overview", "inbox-replies-and-threading", "reply-to-a-conversation", "inbox-missing-replies"],
  },
  {
    slug: "warmup",
    label: "Warmup",
    articles: ["how-warmup-works", "start-warmup", "warmup-settings", "warmup-troubleshooting"],
  },
  {
    slug: "domains",
    label: "Domains",
    articles: ["why-domain-verification-matters", "verify-a-domain", "spf-dkim-dmarc", "dns-propagation", "tracking-domains", "domain-receiving-setup", "domain-verification-troubleshooting"],
  },
  {
    slug: "analytics",
    label: "Analytics",
    articles: ["reading-analytics", "metric-definitions", "campaign-performance-comparison", "export-reports"],
  },
  {
    slug: "billing",
    label: "Billing",
    articles: ["plans-and-invoices", "billing-usage", "upgrade-downgrade", "cancel-downgrade-refunds", "payment-issues"],
  },
  {
    slug: "troubleshooting",
    label: "Troubleshooting",
    articles: ["troubleshooting-start-here", "campaign-not-sending", "campaign-launch-failed", "leads-not-importing", "emails-going-to-spam-quickfix", "cannot-sign-in", "contact-support"],
  },
] as const;

export function resolveSupportArticles(slugs: readonly string[]): HelpArticle[] {
  return slugs.flatMap((slug) => {
    const article = getArticle(slug);
    return article ? [article] : [];
  });
}