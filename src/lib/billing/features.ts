/**
 * Canonical MunchReach feature catalog for the plan × feature matrix.
 * Client-safe: no secrets, no server imports.
 *
 * Features backed by a boolean column on `plans` keep using that column so the
 * existing entitlement checks and pricing page stay in sync. Everything else is
 * stored as a keyed row in the existing `plan_features` table — no new tables.
 */

export type FeatureDefinition = {
  key: string;
  label: string;
  category: string;
  description: string;
  /** Column on public.plans that owns this flag, when one already exists. */
  column: string | null;
  /** Value used when neither a column nor a plan_features row exists. */
  fallback: boolean;
};

export const FEATURE_CATALOG: FeatureDefinition[] = [
  {
    key: "campaigns",
    label: "Campaigns",
    category: "Outreach",
    description: "Create and send multi-step outreach sequences.",
    column: null,
    fallback: true,
  },
  {
    key: "unified_inbox",
    label: "Unified inbox",
    category: "Outreach",
    description: "Read and reply to prospect conversations in one place.",
    column: "unified_inbox_enabled",
    fallback: false,
  },
  {
    key: "warmup",
    label: "Inbox warmup",
    category: "Deliverability",
    description: "Automated mailbox warmup and reputation monitoring.",
    column: "warmup_enabled",
    fallback: false,
  },
  {
    key: "crm",
    label: "CRM & pipeline",
    category: "Pipeline",
    description: "Kanban pipeline, contact records, tasks and notes.",
    column: null,
    fallback: false,
  },
  {
    key: "automations",
    label: "Automations",
    category: "Pipeline",
    description: "Trigger / condition / action workflow engine.",
    column: null,
    fallback: false,
  },
  {
    key: "analytics",
    label: "Analytics",
    category: "Insights",
    description: "Deliverability and conversion reporting dashboards.",
    column: "analytics_enabled",
    fallback: false,
  },
  {
    key: "integrations",
    label: "Integrations",
    category: "Platform",
    description: "Connect MunchReach to external CRMs and tools.",
    column: null,
    fallback: false,
  },
  {
    key: "api_access",
    label: "API access",
    category: "Platform",
    description: "Programmatic access to the MunchReach API.",
    column: "api_access",
    fallback: false,
  },
  {
    key: "custom_branding",
    label: "Custom branding",
    category: "Platform",
    description: "White-label tracking domains and branding.",
    column: "custom_branding",
    fallback: false,
  },
  {
    key: "sso",
    label: "SSO / SAML",
    category: "Security",
    description: "Single sign-on for the whole workspace.",
    column: "sso_enabled",
    fallback: false,
  },
  {
    key: "ai_personalization",
    label: "AI personalization",
    category: "Outreach",
    description: "AI-written opening lines and personalized variables for each lead.",
    column: null,
    fallback: false,
  },
  {
    key: "priority_support",
    label: "Priority support",
    category: "Support",
    description: "Fast-lane support queue and dedicated help.",
    column: "priority_support",
    fallback: false,
  },
];

export const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function featureDefinition(key: string): FeatureDefinition | undefined {
  return FEATURE_CATALOG.find((f) => f.key === key);
}

export const CREDIT_ENTRY_TYPES = [
  "plan_allocation",
  "usage",
  "purchase",
  "admin_adjustment",
  "refund",
  "bonus",
  "expiration",
  "correction",
] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

export const CREDIT_TYPE_LABELS: Record<CreditEntryType, string> = {
  plan_allocation: "Plan allocation",
  usage: "Usage",
  purchase: "Purchase",
  admin_adjustment: "Admin adjustment",
  refund: "Refund",
  bonus: "Bonus",
  expiration: "Expiration",
  correction: "Correction",
};

export function formatCredits(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat().format(value);
}
