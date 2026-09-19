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

