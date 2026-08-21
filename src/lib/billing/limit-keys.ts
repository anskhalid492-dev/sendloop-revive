/** Plan limit column keys. Client-safe. */
export const PLAN_LIMIT_KEYS = [
  "max_users",
  "max_leads",
  "max_campaigns",
  "max_active_campaigns",
  "max_emails_monthly",
  "max_emails_daily",
  "max_sending_accounts",
  "max_domains",
  "max_workspaces",
  "max_automations",
  "max_ai_monthly",
  "max_warmup_daily",
] as const;

export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];
