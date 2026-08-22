/**
 * Client-safe types and helpers for the customer Email Accounts experience.
 *
 * MunchReach operates the sending infrastructure: nothing in this module (or the
 * server functions that use it) exposes providers, credentials or pools.
 */

export type AuthCheck = "pass" | "fail" | "unknown";

export type EmailAccountRow = {
  id: string;
  label: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  daily_limit: number;
  hourly_limit: number;
  sent_today: number;
  health_score: number;
  warmup_status: string;
  warmup_daily_target: number;
  warmup_started_at: string | null;
  warmup_target_days: number;
  customer_enabled: boolean;
  paused: boolean;
  status: "untested" | "verified" | "failed" | "disabled";
  spf_status: AuthCheck;
  dkim_status: AuthCheck;
  dmarc_status: AuthCheck;
  mx_status: AuthCheck;
  assigned_at: string | null;
  created_at: string;
  last_sent_at: string | null;
  last_reply_at: string | null;
  /** Derived, never stored. */
  domain: string;
  accountStatus: AccountStatus;
  campaignCount: number;
  activeCampaigns: number;
  completedCampaigns: number;
  stats: AccountStats | null;
  warmupStats: WarmupAccountStats | null;
};

/** Real warmup sending activity for one mailbox (never mixed with campaign sends). */
export type WarmupAccountStats = {
  sentToday: number;
  targetToday: number;
  sentTotal: number;
  delivered: number;
  replied: number;
  bounced: number;
  inbox: number;
  spam: number;
};

export type AccountStats = {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  replies: number;
  lastSentAt: string | null;
  lastReplyAt: string | null;
};

export type AccountStatus = "active" | "warming" | "paused" | "inactive" | "error";

export type EmailAccountSummary = {
  totalAccounts: number;
  totalDomains: number;
  warming: number;
  errors: number;
  alerts: number;
  dailyCapacity: number;
  sentToday: number;
};

export type EmailAccountFilters = {
  page: number;
  pageSize: number;
  search: string;
  status: AccountStatus | "all";
  warmup: "all" | "warming" | "complete" | "not_started" | "attention";
  health: "all" | "good" | "fair" | "poor";
  domain: string;
  campaignId: string;
  sort:
    | "health"
    | "sent_today"
    | "daily_limit"
    | "warmup"
    | "last_activity"
    | "created_at"
    | "email";
  dir: "asc" | "desc";
};

export const DEFAULT_PAGE_SIZE = 50;

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Active",
  warming: "Warming",
  paused: "Paused",
  inactive: "Inactive",
  error: "Error",
};

export const ACCOUNT_STATUS_STYLE: Record<AccountStatus, string> = {
  active: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warming: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paused: "border-border bg-muted text-muted-foreground",
  inactive: "border-border bg-muted text-muted-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Real status from stored account state — no synthetic values. */
export function accountStatusOf(account: {
  paused: boolean;
  customer_enabled: boolean;
  status: string;
  warmup_status: string;
  health_score: number;
}): AccountStatus {
  if (account.status === "failed") return "error";
  if (account.status === "disabled") return "inactive";
  if (account.paused) return "paused";
  if (!account.customer_enabled) return "paused";
  if (account.warmup_status === "warming") return "warming";
  return "active";
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export function healthBand(score: number): "good" | "fair" | "poor" {
  if (score >= 85) return "good";
  if (score >= 70) return "fair";
  return "poor";
}

export const HEALTH_STYLE: Record<"good" | "fair" | "poor", string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  fair: "text-amber-600 dark:text-amber-400",
  poor: "text-destructive",
};

/** Warmup day progress, only when a real start date exists. */
export function warmupProgress(account: {
  warmup_status: string;
  warmup_started_at: string | null;
  warmup_target_days: number;
}): { label: string; days: number | null; targetDays: number; percent: number | null } {
  const targetDays = account.warmup_target_days || 14;
  if (account.warmup_status === "complete" || account.warmup_status === "completed") {
    return { label: "Warmup complete", days: null, targetDays, percent: 100 };
  }
  if (account.warmup_status === "attention" || account.warmup_status === "paused") {
    return { label: "Needs attention", days: null, targetDays, percent: null };
  }
  if (account.warmup_status !== "warming") {
    return { label: "Not started", days: null, targetDays, percent: null };
  }
  if (!account.warmup_started_at) {
    return { label: "Warming", days: null, targetDays, percent: null };
  }
  const started = new Date(account.warmup_started_at).getTime();
  const days = Math.min(
    targetDays,
    Math.max(1, Math.ceil((Date.now() - started) / (1000 * 60 * 60 * 24))),
  );
  return {
    label: "Warming",
    days,
    targetDays,
    percent: Math.round((days / targetDays) * 100),
  };
}

export function rate(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function defaultFilters(): EmailAccountFilters {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    status: "all",
    warmup: "all",
    health: "all",
    domain: "all",
    campaignId: "all",
    sort: "created_at",
    dir: "asc",
  };
}
