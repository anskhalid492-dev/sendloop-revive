/** Client-safe types and labels shared by the customer and admin support UIs. */

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_customer: "Waiting for customer",
  resolved: "Resolved",
  closed: "Closed",
};

export const SUPPORT_STATUS_STYLE: Record<SupportStatus, string> = {
  open: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_progress: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  waiting_customer: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  resolved: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "border-border bg-muted text-muted-foreground",
};

export const SUPPORT_CATEGORIES = [
  "account",
  "billing",
  "campaigns",
  "email_accounts",
  "warmup",
  "unified_inbox",
  "deliverability",
  "technical",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  account: "Account",
  billing: "Billing",
  campaigns: "Campaigns",
  email_accounts: "Email Accounts",
  warmup: "Warmup",
  unified_inbox: "Unified Inbox",
  deliverability: "Deliverability",
  technical: "Technical Issue",
  other: "Other",
  // Legacy values from earlier tickets.
  general: "Other",
  bug: "Technical Issue",
  feature: "Other",
};

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const SUPPORT_PRIORITY_STYLE: Record<string, string> = {
  low: "border-border bg-muted text-muted-foreground",
  normal: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  high: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  urgent: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function ticketReference(id: string) {
  return `SL-${id.slice(0, 8).toUpperCase()}`;
}

export type HelpArticle = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: string[];
};

/** Static, curated help content — no fabricated tickets or replies. */
export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "connect-a-sending-domain",
    title: "Connect and verify a sending domain",
    category: "Email Accounts",
    summary: "Add your domain, publish the DNS records and get verified before sending.",
    body: [
      "Open Email Accounts and choose Add domain. Enter a domain you already own — Sendloop never registers domains for you.",
      "Publish the generated SPF, DKIM, DMARC and tracking records at your registrar. DNS changes can take up to a few hours to propagate.",
      "Run Verify. Sendloop performs a real DNS lookup and also confirms the domain with the managed sending infrastructure. Mailboxes on the domain only become active once both checks pass.",
    ],
  },
  {
    slug: "why-is-my-test-email-not-arriving",
    title: "Why is my test email not arriving?",
    category: "Deliverability",
    summary: "The most common causes of a test send that is accepted but never delivered.",
    body: [
      "Check the delivery status shown in the preview dialog. Accepted means the provider took the message; delivered means the receiving server confirmed it.",
      "If the status stays accepted, look for a bounce or spam complaint in Analytics. A blocked domain usually means the sending domain is not fully verified.",
      "Confirm the mailbox is not paused and that today's daily limit has not been reached.",
    ],
  },
  {
    slug: "how-warmup-works",
    title: "How email warmup works",
    category: "Warmup",
    summary: "Ramp schedule, health score and automatic pausing explained.",
    body: [
      "Warmup gradually increases the daily volume of a mailbox from its start volume to its maximum over the ramp period you configure.",
      "Health score reflects real delivery, bounce and reply data. If bounce rate crosses your threshold, auto-pause stops the mailbox before your domain reputation suffers.",
      "Keep warmup running for at least two weeks on a brand new domain before launching a large campaign.",
    ],
  },
  {
    slug: "campaign-launch-checklist",
    title: "Campaign launch checklist",
    category: "Campaigns",
    summary: "What Sendloop checks before a campaign can go live.",
    body: [
      "A campaign needs at least one sequence step, one eligible lead list and one active mailbox on a verified domain.",
      "The launch readiness bar shows every blocking item. Resolve each one and the Launch button unlocks.",
      "Sending respects your workspace sending window, days and per-mailbox daily limits.",
    ],
  },
  {
    slug: "replies-in-the-unified-inbox",
    title: "Replies in the Unified Inbox",
    category: "Unified Inbox",
    summary: "How inbound replies are threaded, routed and answered.",
    body: [
      "Inbound replies are matched to the original campaign message and appear as a threaded conversation in the Unified Inbox.",
      "Replying from the inbox sends through the same mailbox that sent the original email, keeping the thread intact.",
      "A reply automatically stops the remaining sequence steps for that contact and updates their CRM stage.",
    ],
  },
  {
    slug: "team-roles-and-permissions",
    title: "Team roles and permissions",
    category: "Account",
    summary: "Who can change what inside a workspace.",
    body: [
      "Owners control billing, workspace deletion and every setting. Admins manage the team, domains, mailboxes and campaigns.",
      "Members can work on campaigns, the inbox and CRM but cannot change workspace or billing settings.",
      "Every permission is enforced in the database, not only in the interface.",
    ],
  },
  {
    slug: "billing-and-plans",
    title: "Billing, plans and usage",
    category: "Billing",
    summary: "Where to see your plan, renewal date and monthly usage.",
    body: [
      "Settings → Billing shows your current plan, payment status, renewal date and this month's real usage against your plan limits.",
      "Usage counters are calculated from actual sends, mailboxes, contacts and campaigns in your workspace.",
      "To change plan, choose Upgrade plan and pick the plan that fits your volume.",
    ],
  },
];

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((a) =>
    [a.title, a.summary, a.category, ...a.body].join(" ").toLowerCase().includes(q),
  );
}
