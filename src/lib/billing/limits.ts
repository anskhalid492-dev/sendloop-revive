/**
 * Canonical usage-resource catalog for plan limit enforcement.
 * Client-safe: no secrets, no server imports. Both the enforcement service and
 * the customer usage dashboard read this list, so limits never drift.
 */
import type { PlanLimitKey } from "@/lib/billing/limit-keys";

export type UsageResource =
  | "leads"
  | "campaigns"
  | "active_campaigns"
  | "sending_accounts"
  | "domains"
  | "team_members"
  | "automations"
  | "emails_monthly"
  | "ai_monthly";

export type ResourceDefinition = {
  key: UsageResource;
  label: string;
  /** Column on public.plans holding the cap. */
  limitKey: PlanLimitKey;
  /** `derived` = counted from live rows, `metered` = atomic period counter. */
  kind: "derived" | "metered";
  /** Reset window for metered resources. */
  period: "total" | "month";
  unit: string;
};

export const RESOURCE_CATALOG: ResourceDefinition[] = [
  { key: "leads", label: "Leads", limitKey: "max_leads", kind: "derived", period: "total", unit: "leads" },
  { key: "campaigns", label: "Campaigns", limitKey: "max_campaigns", kind: "derived", period: "total", unit: "campaigns" },
  { key: "active_campaigns", label: "Active campaigns", limitKey: "max_active_campaigns", kind: "derived", period: "total", unit: "campaigns" },
  { key: "sending_accounts", label: "Email accounts", limitKey: "max_sending_accounts", kind: "derived", period: "total", unit: "mailboxes" },
  { key: "domains", label: "Sending domains", limitKey: "max_domains", kind: "derived", period: "total", unit: "domains" },
  { key: "team_members", label: "Team members", limitKey: "max_users", kind: "derived", period: "total", unit: "members" },
  { key: "automations", label: "Automations", limitKey: "max_automations", kind: "derived", period: "total", unit: "automations" },
  { key: "emails_monthly", label: "Emails sent", limitKey: "max_emails_monthly", kind: "metered", period: "month", unit: "emails" },
  { key: "ai_monthly", label: "AI personalizations", limitKey: "max_ai_monthly", kind: "metered", period: "month", unit: "generations" },
];

export function resourceDefinition(key: UsageResource): ResourceDefinition {
  const found = RESOURCE_CATALOG.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown usage resource: ${key}`);
  return found;
}

/** Customer-facing copy for a blocked action. Never leak technical detail. */
export function limitMessage(label: string, planName: string, used: number, limit: number) {
  return `You've reached your ${label.toLowerCase()} limit for the ${planName} plan (${used.toLocaleString()} of ${limit.toLocaleString()}).`;
}
