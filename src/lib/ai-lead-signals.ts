/**
 * Lead signal extraction for AI personalization — client-safe, pure.
 *
 * Imported lead lists put firmographic data (funding, revenue, tech stack,
 * headcount, LinkedIn…) into custom fields under many different column names.
 * This module recognises those columns, labels them consistently and tags how
 * carefully the AI must treat each one. It only ever reads what the lead
 * actually holds — nothing is inferred or filled in.
 */

export type SignalKind =
  | "funding_round"
  | "funding_amount"
  | "revenue"
  | "tech_stack"
  | "employees"
  | "company_size"
  | "linkedin"
  | "recent_news";

export type LeadSignal = {
  kind: SignalKind;
  label: string;
  value: string;
  /** How the model must treat it in copy. */
  handling: "normal" | "indirect";
};

const ALIASES: Record<SignalKind, string[]> = {
  funding_round: ["funding_round", "last_funding_round", "funding_stage", "round", "latest_funding_type", "funding_type"],
  funding_amount: ["funding_amount", "total_funding", "last_funding_amount", "funding", "amount_raised", "total_raised"],
  revenue: ["annual_revenue", "revenue", "estimated_revenue", "revenue_range", "arr"],
  tech_stack: ["technologies", "technology", "tech_stack", "techstack", "tech", "tools", "software_used"],
  employees: ["employees", "number_of_employees", "employee_count", "num_employees", "headcount", "estimated_num_employees"],
  company_size: ["company_size", "size", "employee_range"],
  linkedin: ["linkedin", "linkedin_url", "person_linkedin_url", "linkedin_headline", "headline", "linkedin_summary"],
  recent_news: ["recent_news", "company_news", "news", "trigger", "signal", "company_signal"],
};

const LABELS: Record<SignalKind, string> = {
  funding_round: "Funding round",
  funding_amount: "Funding amount",
  revenue: "Annual revenue",
  tech_stack: "Technology stack",
  employees: "Number of employees",
  company_size: "Company size",
  linkedin: "LinkedIn",
  recent_news: "Recent company information",
};

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Values that mean "we don't know" in exported spreadsheets. */
export function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const v = String(value).trim().toLowerCase();
  return !v || ["n/a", "na", "none", "null", "undefined", "-", "--", "unknown", "0", "[]", "{}"].includes(v);
}

/** Recognised signals, plus the custom-field keys they consumed. */
export function extractSignals(custom: Record<string, unknown> | null | undefined): {
  signals: LeadSignal[];
  consumedKeys: Set<string>;
} {
  const signals: LeadSignal[] = [];
  const consumedKeys = new Set<string>();
  const entries = Object.entries(custom ?? {});
  for (const kind of Object.keys(ALIASES) as SignalKind[]) {
    const match = entries.find(([key, value]) => ALIASES[kind].includes(normalizeKey(key)) && !isBlankValue(value));
    if (!match) continue;
    consumedKeys.add(match[0]);
    // LinkedIn URLs carry no readable meaning — only keep text like a headline.
    const value = String(match[1]).trim().slice(0, 300);
    if (kind === "linkedin" && /^https?:\/\//i.test(value)) continue;
    signals.push({
      kind,
      label: LABELS[kind],
      value,
      handling: kind === "revenue" || kind === "funding_amount" ? "indirect" : "normal",
    });
  }
  return { signals, consumedKeys };
}

/** Broad role family, used to steer the angle toward what that buyer cares about. */
export type RoleFamily =
  | "founder_ceo"
  | "finance"
  | "sales"
  | "marketing"
  | "technical"
  | "people"
  | "operations"
  | "other";

export function roleFamily(title: string | null | undefined): RoleFamily {
  const t = ` ${(title ?? "").toLowerCase()} `;
  if (!t.trim()) return "other";
  if (/\b(cfo|finance|financial|controller|accounting|treasur)/.test(t)) return "finance";
  if (/\b(cto|cio|engineer|engineering|developer|technical|technology|it |devops|architect|data)/.test(t)) return "technical";
  if (/\b(hr|human resources|people|talent|recruit|hiring)/.test(t)) return "people";
  if (/\b(cmo|marketing|growth|brand|demand gen|content)/.test(t)) return "marketing";
  if (/\b(cro|sales|revenue|business development|bdr|sdr|account executive|partnerships)/.test(t)) return "sales";
  if (/\b(coo|operations|ops|supply|logistics|procurement)/.test(t)) return "operations";
  if (/\b(ceo|founder|co-founder|cofounder|owner|president|managing director|principal)/.test(t)) return "founder_ceo";
  return "other";
}

export const ROLE_GUIDANCE: Record<RoleFamily, string> = {
  founder_ceo: "Founder/CEO: speak to growth, focus and strategic outcomes. Plain, peer-level, very short.",
  finance: "Finance leader: speak to cost, efficiency, predictability and risk. Concrete, no hype.",
  sales: "Sales leader: speak to pipeline, conversion, rep productivity and quota.",
  marketing: "Marketing leader: speak to pipeline contribution, reach, conversion and brand.",
  technical: "Technical leader: speak to reliability, integration effort, security and engineering time. No fluff.",
  people: "People/HR/recruiting leader: speak to hiring speed, retention, candidate or employee experience.",
  operations: "Operations leader: speak to process efficiency, errors, throughput and cost.",
  other: "Match the angle to the stated role; keep it practical.",
};
