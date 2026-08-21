export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type StepConfig = Record<string, string | number | boolean | null>;

export type StepType = "email" | "wait" | "condition" | "task" | "crm" | "webhook" | "stop";

export type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  list_id: string | null;
  sending_account_ids: string[];
  timezone: string;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  daily_cap: number;
  stop_on_reply: boolean;
  status: CampaignStatus;
  launched_at: string | null;
  created_at: string;
  tags: string[];
  start_at: string | null;
  end_at: string | null;
  min_delay_minutes: number;
  random_delay_minutes: number;
  max_per_hour: number;
  business_days_only: boolean;
  open_tracking: boolean;
  click_tracking: boolean;
  text_only: boolean;
  stop_on_company_reply: boolean;
  max_contacts_per_company: number;
  unsubscribe_enabled: boolean;
  inbox_rotation_enabled: boolean;
  inbox_rotation_strategy: InboxRotationStrategy;
  rotation_daily_cap_per_inbox: number;
  custom_variables: CustomVariable[];
};

/** A workspace-authored personalization token, defined per campaign. */
export type CustomVariable = {
  token: string;
  label: string;
  defaultValue: string;
};

/** Normalize a user-typed variable name into a safe token. */
export function normalizeVariableToken(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export type InboxRotationStrategy = "round_robin" | "random" | "least_used";

export const INBOX_ROTATION_STRATEGIES: Array<{
  value: InboxRotationStrategy;
  label: string;
  hint: string;
}> = [
  {
    value: "round_robin",
    label: "Round robin",
    hint: "Even, predictable spread — each mailbox takes the next lead in turn.",
  },
  {
    value: "random",
    label: "Random",
    hint: "Shuffles mailboxes so sending patterns look less mechanical.",
  },
  {
    value: "least_used",
    label: "Least used first",
    hint: "Prefers the mailboxes with the most headroom left today.",
  },
];

export type CampaignStepVariant = {
  id: string;
  step_id: string;
  label: string;
  subject: string;
  body: string;
  weight: number;
};

export type CampaignStep = {
  id: string;
  step_order: number;
  subject: string;
  body: string;
  wait_days: number;
  wait_hours: number;
  name: string;
  step_type: StepType;
  delay_minutes: number;
  same_thread: boolean;
  config: StepConfig;
  variants?: CampaignStepVariant[];
};

export const CAMPAIGN_COLUMNS =
  "id, workspace_id, name, description, list_id, sending_account_ids, timezone, send_days, send_start_hour, send_end_hour, daily_cap, stop_on_reply, status, launched_at, created_at, tags, start_at, end_at, min_delay_minutes, random_delay_minutes, max_per_hour, business_days_only, open_tracking, click_tracking, text_only, stop_on_company_reply, max_contacts_per_company, unsubscribe_enabled, inbox_rotation_enabled, inbox_rotation_strategy, rotation_daily_cap_per_inbox, custom_variables";

export const STEP_COLUMNS =
  "id, step_order, subject, body, wait_days, wait_hours, name, step_type, delay_minutes, same_thread, config";

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  email: "Email",
  wait: "Wait",
  condition: "Condition",
  task: "Task",
  crm: "CRM action",
  webhook: "Webhook",
  stop: "Stop",
};

export type LeadLike = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  custom_fields?: Record<string, string> | null;
};

export type VariableDef = { token: string; label: string };

/** The AI-generated snippet token. Resolved from stored personalization, never lead data. */
export const AI_VARIABLE_TOKEN = "ai_personalization";

/** The single source of truth for built-in personalization variables. */
export const VARIABLE_GROUPS: Array<{ group: string; variables: VariableDef[] }> = [
  {
    group: "Contact",
    variables: [
      { token: "first_name", label: "First name" },
      { token: "last_name", label: "Last name" },
      { token: "email", label: "Email" },
      { token: "phone", label: "Phone" },
      { token: "linkedin_url", label: "LinkedIn URL" },
    ],
  },
  {
    group: "Company",
    variables: [
      { token: "company", label: "Company" },
      { token: "job_title", label: "Job title" },
      { token: "website", label: "Website" },
      { token: "industry", label: "Industry" },
      { token: "location", label: "Location" },
      { token: "company_description", label: "Company description" },
    ],
  },
  {
    group: "Sender",
    variables: [
      { token: "sender_name", label: "Sender name" },
      { token: "sender_email", label: "Sender email" },
    ],
  },
  {
    group: "AI",
    variables: [{ token: AI_VARIABLE_TOKEN, label: "AI personalization" }],
  },
];

export const LEAD_VARIABLES: VariableDef[] = VARIABLE_GROUPS.flatMap((g) => g.variables);

/** Aliases accepted in templates but not shown in the picker. */
const VARIABLE_ALIASES: Record<string, string> = {
  company_name: "company",
  country: "location",
  city: "location",
  title: "job_title",
  role: "job_title",
  linkedin: "linkedin_url",
  domain: "website",
  description: "company_description",
};

/** Tokens the sending system fills in itself. */
export const SYSTEM_VARIABLES = new Set(["unsubscribe_link", "sender_name", "sender_email"]);

export type SenderLike = {
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
} | null | undefined;

/**
 * Values for the sender tokens ({{sender_name}}, {{sender_email}}), taken from
 * the mailbox the email is actually sent from. Empty fields are omitted so an
 * inline fallback (`{{sender_name | The team}}`) still applies.
 */
export function senderExtras(account: SenderLike): Record<string, string> {
  const out: Record<string, string> = {};
  const name = account?.from_name?.trim();
  const email = account?.from_email?.trim();
  if (name) out["sender_name"] = name;
  else if (email) out["sender_name"] = email.split("@")[0] ?? "";
  if (email) out["sender_email"] = email;
  return out;
}

export function variableLabel(token: string): string {
  const canonical = VARIABLE_ALIASES[token] ?? token;
  return (
    LEAD_VARIABLES.find((v) => v.token === canonical)?.label ??
    token.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export function isLeadVariable(token: string): boolean {
  const canonical = VARIABLE_ALIASES[token] ?? token;
  return LEAD_VARIABLES.some((v) => v.token === canonical);
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;

function leadLocation(lead: LeadLike): string | undefined {
  const parts = [lead.city, lead.state, lead.country].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Resolve a token against a lead row (built-in field, alias, or custom field). */
export function leadValue(lead: LeadLike, token: string): string | undefined {
  const canonical = VARIABLE_ALIASES[token] ?? token;
  const custom = (lead.custom_fields ?? {}) as Record<string, string>;
  const direct: Record<string, string | null | undefined> = {
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    company: lead.company,
    job_title: lead.job_title,
    website: lead.website,
    phone: lead.phone,
    linkedin_url: lead.linkedin_url,
    location: leadLocation(lead),
    // Not columns on the lead table — they live in custom fields when imported.
    industry: custom["industry"],
    company_description: custom["company_description"] ?? custom["description"],
  };
  const value = direct[canonical] ?? custom[token] ?? custom[canonical];
  return value ? String(value) : undefined;
}


/**
 * Replace {{variable}} and {{variable | fallback}} tokens with lead data.
 *
 * `extras` carries values the sending pipeline resolves itself (today: the
 * AI-generated `{{ai_personalization}}` snippet) and always wins over lead data.
 */
export function renderTemplate(
  template: string,
  lead: LeadLike,
  customVariables: CustomVariable[] = [],
  extras: Record<string, string> = {},
): string {
  const defaults = new Map(customVariables.map((v) => [v.token, v.defaultValue]));
  return template.replace(VARIABLE_RE, (_m, token: string, fallback?: string) => {
    const extra = extras[token];
    if (typeof extra === "string") return extra;
    const value = leadValue(lead, token);
    if (value) return value;
    const trimmed = (fallback ?? "").trim();
    if (trimmed) return trimmed;
    return defaults.get(token) ?? "";
  });
}

export type RenderableStep = { subject: string; body: string };

export type RenderOptions = {
  customVariables?: CustomVariable[];
  /** Values resolved outside lead data — today the AI personalization snippet. */
  extras?: Record<string, string>;
  /** Which spintax branch to pick; keeps preview and send deterministic. */
  spintaxIndex?: number;
};

/**
 * THE renderer. Preview, test send, launch and follow-up dispatch all call this
 * so a lead can never see different copy from what the operator previewed.
 *
 * Order matters: variables (which support `{{token|fallback}}`) are resolved
 * BEFORE spintax, otherwise the spintax pass eats the `{token|fallback}` inner
 * braces and leaves literal `{first_name}` in the delivered email.
 */
export function renderEmailForLead(
  step: RenderableStep,
  lead: LeadLike,
  options: RenderOptions = {},
): { subject: string; body: string } {
  const { customVariables = [], extras = {}, spintaxIndex = 0 } = options;
  const render = (text: string) =>
    resolveSpintax(renderTemplate(text ?? "", lead, customVariables, extras), spintaxIndex);
  return { subject: render(step.subject ?? ""), body: render(step.body ?? "") };
}



/**
 * Tokens that would render empty for this specific lead and have no fallback.
 * Requires a lead — without lead data nothing can be declared missing.
 */
export function missingVariables(
  template: string,
  lead?: LeadLike,
  customVariables: CustomVariable[] = [],
): string[] {
  if (!lead) return [];
  const missing = new Set<string>();
  const withDefault = new Set(
    customVariables.filter((v) => v.defaultValue.trim()).map((v) => v.token),
  );
  for (const match of template.matchAll(VARIABLE_RE)) {
    const token = match[1]!;
    const fallback = (match[2] ?? "").trim();
    if (fallback || withDefault.has(token) || SYSTEM_VARIABLES.has(token)) continue;
    if (leadValue(lead, token)) continue;
    missing.add(token);
  }
  return [...missing];
}

export type VariableResolution = {
  token: string;
  label: string;
  where: Array<"subject" | "body">;
  source: "lead" | "ai" | "fallback" | "custom_default" | "system" | "missing" | "unknown";
  value: string | null;
};

/**
 * Per-token report of what the preview actually resolved, so an operator can
 * see which variables fell back and which would send blank.
 *
 * `extras` carries AI personalization exactly as the send path passes it.
 */
export function variableResolutionReport(
  subject: string,
  body: string,
  lead?: LeadLike,
  customVariables: CustomVariable[] = [],
  extras: Record<string, string> = {},
): VariableResolution[] {
  const defaults = new Map(
    customVariables.filter((v) => v.defaultValue.trim()).map((v) => [v.token, v.defaultValue.trim()]),
  );
  const known = new Set(customVariables.map((v) => v.token));
  const out = new Map<string, VariableResolution>();

  const scan = (template: string, where: "subject" | "body") => {
    for (const match of template.matchAll(VARIABLE_RE)) {
      const token = match[1]!;
      const fallback = (match[2] ?? "").trim();
      const extra = extras[token];
      const value = lead ? leadValue(lead, token) : undefined;
      let source: VariableResolution["source"];
      let resolved: string | null;
      if (typeof extra === "string" && extra.trim() && SYSTEM_VARIABLES.has(token)) {
        // Sender tokens come from the mailbox, not the lead or the model.
        source = "system";
        resolved = extra.trim();
      } else if (typeof extra === "string" && extra.trim()) {
        source = "ai";
        resolved = extra.trim();
      } else if (value) {
        source = "lead";
        resolved = value;
      } else if (SYSTEM_VARIABLES.has(token)) {
        source = "system";
        resolved = null;
      } else if (fallback) {
        source = "fallback";
        resolved = fallback;
      } else if (defaults.has(token)) {
        source = "custom_default";
        resolved = defaults.get(token)!;
      } else if (isLeadVariable(token) || known.has(token) || token === AI_VARIABLE_TOKEN) {
        // A supported variable the lead simply has no value for: sends empty.
        source = "missing";
        resolved = null;
      } else {
        source = "unknown";
        resolved = null;
      }

      const existing = out.get(token);
      if (existing) {
        if (!existing.where.includes(where)) existing.where.push(where);
        continue;
      }
      out.set(token, {
        token,
        label: customVariables.find((v) => v.token === token)?.label ?? variableLabel(token),
        where: [where],
        source,
        value: resolved,
      });

    }
  };

  scan(subject, "subject");
  scan(body, "body");
  return [...out.values()];
}


export type VariableUse = { token: string; fallback: string };

export function parseVariables(template: string): VariableUse[] {
  const seen = new Map<string, VariableUse>();
  for (const match of template.matchAll(VARIABLE_RE)) {
    const token = match[1]!;
    const fallback = (match[2] ?? "").trim();
    const existing = seen.get(token);
    if (!existing || (!existing.fallback && fallback)) seen.set(token, { token, fallback });
  }
  return [...seen.values()];
}

export type VariableStatus = "ok" | "partial" | "empty" | "unknown";

export type VariableCheck = {
  token: string;
  label: string;
  source: "lead" | "custom_variable" | "custom_field" | "system" | "unknown";
  fallback: string;
  filled: number;
  total: number;
  status: VariableStatus;
};

/**
 * Audit every variable used in a template against real lead data.
 * A known field is never flagged just because a fallback is absent — only
 * genuinely empty values (with no fallback and no default) raise a warning.
 */
export function auditVariables(
  template: string,
  options: {
    leads?: LeadLike[];
    customVariables?: CustomVariable[];
    customFieldKeys?: string[];
  } = {},
): VariableCheck[] {
  const leads = options.leads ?? [];
  const customVariables = options.customVariables ?? [];
  const customFieldKeys = new Set(options.customFieldKeys ?? []);

  return parseVariables(template).map((use) => {
    const custom = customVariables.find((v) => v.token === use.token);
    const source: VariableCheck["source"] = SYSTEM_VARIABLES.has(use.token)
      ? "system"
      : isLeadVariable(use.token)
        ? "lead"
        : custom
          ? "custom_variable"
          : customFieldKeys.has(use.token)
            ? "custom_field"
            : "unknown";

    const label = custom?.label ?? variableLabel(use.token);
    const hasFallback = Boolean(use.fallback) || Boolean(custom?.defaultValue.trim());
    const total = leads.length;
    const filled = leads.filter((lead) => Boolean(leadValue(lead, use.token))).length;

    let status: VariableStatus;
    if (source === "unknown") status = hasFallback ? "ok" : "unknown";
    else if (source === "system" || hasFallback) status = "ok";
    else if (total === 0) status = "ok";
    else if (filled === total) status = "ok";
    else if (filled > 0) status = "partial";
    else status = "empty";

    return { token: use.token, label, source, fallback: use.fallback, filled, total, status };
  });
}

export function usedVariables(template: string): string[] {
  return parseVariables(template).map((v) => v.token);
}


const SPINTAX_RE = /\{([^{}]*\|[^{}]*)\}/;

/** Deterministically resolve spintax for preview purposes (index picks the branch). */
export function resolveSpintax(text: string, index = 0): string {
  let out = text;
  let guard = 0;
  while (SPINTAX_RE.test(out) && guard++ < 50) {
    out = out.replace(SPINTAX_RE, (_m, group: string) => {
      const options = group.split("|");
      return options[index % options.length]!.trim();
    });
  }
  return out;
}

export function spintaxVariationCount(text: string): number {
  let count = 1;
  let rest = text;
  let guard = 0;
  while (SPINTAX_RE.test(rest) && guard++ < 50) {
    const match = rest.match(SPINTAX_RE)!;
    count *= match[1]!.split("|").length;
    rest = rest.replace(SPINTAX_RE, "");
  }
  return count;
}

export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: "Not contacted",
  in_progress: "In progress",
  completed: "Completed",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  failed: "Failed",
  stopped: "Paused",
};

/**
 * Live per-lead delivery state, derived from the actual message events
 * (queued → sent → delivered → opened → clicked → replied, or a terminal
 * bounce/failure). Strongest signal wins so a late "delivered" never hides a
 * bounce.
 */
export const LEAD_DELIVERY_STATES = [
  "not_contacted",
  "queued",
  "sent",
  "delayed",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "unsubscribed",
  "complained",
  "bounced",
  "failed",
] as const;

export type LeadDeliveryState = (typeof LEAD_DELIVERY_STATES)[number];

export const LEAD_DELIVERY_LABELS: Record<LeadDeliveryState, string> = {
  not_contacted: "Not contacted",
  queued: "Queued",
  sent: "Sent",
  delayed: "Delayed",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  replied: "Replied",
  unsubscribed: "Unsubscribed",
  complained: "Complained",
  bounced: "Bounced",
  failed: "Failed",
};

export const LEAD_DELIVERY_STYLES: Record<LeadDeliveryState, string> = {
  not_contacted: "bg-muted text-muted-foreground",
  queued: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  delayed: "bg-amber-500/15 text-amber-600",
  delivered: "bg-sky-500/15 text-sky-600",
  opened: "bg-emerald-500/15 text-emerald-600",
  clicked: "bg-emerald-500/20 text-emerald-700",
  replied: "bg-emerald-600/20 text-emerald-700",
  unsubscribed: "bg-amber-500/15 text-amber-600",
  complained: "bg-destructive/15 text-destructive",
  bounced: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
};

