/**
 * Client-safe vocabulary for AI personalization.
 *
 * Kept out of the server-function module so components can import the presets,
 * types and helpers without pulling server-only code into the browser bundle.
 */

export type PersonalizationLevel = "light" | "balanced" | "deep";

export type PersonalizationTone =
  | "professional"
  | "friendly"
  | "direct"
  | "conversational"
  | "curious";

export type PersonalizationLength = "one_line" | "two_lines" | "short_paragraph";

export type FallbackMode = "fallback_text" | "skip" | "hold";

/** Lead/company fields the AI is allowed to look at. */
export type PersonalizationField =
  | "first_name"
  | "last_name"
  | "job_title"
  | "company"
  | "website"
  | "industry"
  | "location"
  | "company_description"
  | "notes"
  | "custom_fields";

/** Sales framework that shapes the angle of the generated line. */
export type PersonalizationFramework =
  | "offer_driven"
  | "challenger"
  | "problem_solution"
  | "aida"
  | "before_after_bridge"
  | "question_led"
  | "social_proof"
  | "straight_to_point";

export type AiPersonalizationConfig = {
  level: PersonalizationLevel;
  framework: PersonalizationFramework;
  tone: PersonalizationTone;
  length: PersonalizationLength;
  language: string;
  instructions: string;
  fields: PersonalizationField[];
  exampleOutput: string;
  fallbackMode: FallbackMode;
  fallbackText: string;
};


export const AI_TOKEN = "ai_personalization";

export const LEVEL_OPTIONS: Array<{
  value: PersonalizationLevel;
  label: string;
  hint: string;
}> = [
  { value: "light", label: "Light", hint: "One short, safe opener built from the basics." },
  {
    value: "balanced",
    label: "Balanced",
    hint: "Uses role, company and location context where it exists.",
  },
  {
    value: "deep",
    label: "Deep",
    hint: "Uses every allowed field, including description, notes and custom fields.",
  },
];

export const TONE_OPTIONS: Array<{ value: PersonalizationTone; label: string; hint: string }> = [
  { value: "professional", label: "Professional", hint: "Neutral, business-appropriate." },
  { value: "friendly", label: "Friendly", hint: "Warm and human, still concise." },
  { value: "direct", label: "Direct", hint: "Straight to the point, no filler." },
  { value: "conversational", label: "Conversational", hint: "Sounds like a real person typing." },
  { value: "curious", label: "Curious", hint: "Leads with genuine interest and a question." },
];

export const LENGTH_OPTIONS: Array<{ value: PersonalizationLength; label: string }> = [
  { value: "one_line", label: "One sentence" },
  { value: "two_lines", label: "Two sentences" },
  { value: "short_paragraph", label: "Short paragraph" },
];

export const FIELD_OPTIONS: Array<{ value: PersonalizationField; label: string }> = [
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "job_title", label: "Job title" },
  { value: "company", label: "Company" },
  { value: "website", label: "Website" },
  { value: "industry", label: "Industry" },
  { value: "location", label: "Location" },
  { value: "company_description", label: "Company description" },
  { value: "notes", label: "Lead notes" },
  { value: "custom_fields", label: "Custom fields" },
];

export const FALLBACK_OPTIONS: Array<{ value: FallbackMode; label: string; hint: string }> = [
  {
    value: "fallback_text",
    label: "Use fallback text",
    hint: "Send the email with your written fallback in place of the AI line.",
  },
  {
    value: "skip",
    label: "Skip personalization",
    hint: "Remove the AI line and send the rest of the email as written.",
  },
  {
    value: "hold",
    label: "Do not send",
    hint: "Hold the lead back from sending until personalization succeeds.",
  },
];

export const PRESET_INSTRUCTIONS: Record<PersonalizationTone, string> = {
  professional:
    "Write one short opening sentence that shows you understand what this company does, based only on the data provided.",
  friendly:
    "Write one warm, human opening sentence referencing something relevant about the person's role or company from the data provided.",
  direct:
    "Write one short opening sentence that states the relevant context about this company in plain language.",
  conversational:
    "Write one casual opening sentence, as if you already know a little about this company from the data provided.",
  curious:
    "Write one opening sentence that shows genuine curiosity about this person's role or company, based only on the data provided.",
};


/** Sales angles the opener can be written from. */
export const FRAMEWORK_OPTIONS: Array<{
  value: PersonalizationFramework;
  label: string;
  hint: string;
  /** Angle instruction handed to the model. */
  guidance: string;
}> = [
  {
    value: "offer_driven",
    label: "Offer-driven",
    hint: "Lead with the relevance of your offer to their situation.",
    guidance:
      "Frame the opener around why your offer is relevant to this specific company, without pitching or naming a price.",
  },
  {
    value: "challenger",
    label: "Challenger",
    hint: "Open with a respectful, insight-led challenge.",
    guidance:
      "Open with a respectful insight or reframe about their role or market, based only on the given facts. Never criticise them personally.",
  },
  {
    value: "problem_solution",
    label: "Problem → Solution",
    hint: "Name a plausible problem, hint at the fix.",
    guidance:
      "Name a plausible, non-invented problem their role or business type commonly faces, then hint that a fix exists. Do not claim to know their internal situation.",
  },
  {
    value: "aida",
    label: "AIDA",
    hint: "Attention first, interest second.",
    guidance:
      "Open with an attention-grabbing but truthful observation, then create light interest. No call to action in this line.",
  },
  {
    value: "before_after_bridge",
    label: "Before → After → Bridge",
    hint: "Current state, better state, the bridge.",
    guidance:
      "Contrast their likely current state with a better state, and hint at the bridge. Keep it grounded in the provided facts only.",
  },
  {
    value: "question_led",
    label: "Question-led",
    hint: "Open with one relevant question.",
    guidance: "Open with exactly one short, specific and genuinely relevant question.",
  },
  {
    value: "social_proof",
    label: "Social proof",
    hint: "Reference similar companies generically.",
    guidance:
      "Reference, in generic terms, that similar companies or roles face the same thing. Never invent named customers, logos or statistics.",
  },
  {
    value: "straight_to_point",
    label: "Straight to the point",
    hint: "No wind-up, pure relevance.",
    guidance: "No wind-up and no filler: state the single most relevant piece of context directly.",
  },
];

export function frameworkGuidance(framework: PersonalizationFramework): string {
  return (
    FRAMEWORK_OPTIONS.find((option) => option.value === framework)?.guidance ??
    FRAMEWORK_OPTIONS[0]!.guidance
  );
}

export function defaultAiConfig(): AiPersonalizationConfig {
  return {
    level: "balanced",
    framework: "offer_driven",
    tone: "professional",
    length: "one_line",
    language: "English",
    instructions: PRESET_INSTRUCTIONS.professional,
    fields: ["first_name", "job_title", "company", "website", "location", "industry"],
    exampleOutput: "",
    fallbackMode: "fallback_text",
    fallbackText: "I came across your team and wanted to reach out.",
  };
}

/** Coerce whatever is stored on the campaign into a complete config. */
export function normalizeAiConfig(raw: unknown): AiPersonalizationConfig {
  const base = defaultAiConfig();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, unknown>;
  const level = LEVEL_OPTIONS.some((o) => o.value === v["level"])
    ? (v["level"] as PersonalizationLevel)
    : base.level;
  const framework = FRAMEWORK_OPTIONS.some((o) => o.value === v["framework"])
    ? (v["framework"] as PersonalizationFramework)
    : base.framework;
  const tone = TONE_OPTIONS.some((o) => o.value === v["tone"])
    ? (v["tone"] as PersonalizationTone)
    : base.tone;
  const length = LENGTH_OPTIONS.some((o) => o.value === v["length"])
    ? (v["length"] as PersonalizationLength)
    : base.length;
  const fallbackMode = FALLBACK_OPTIONS.some((o) => o.value === v["fallbackMode"])
    ? (v["fallbackMode"] as FallbackMode)
    : base.fallbackMode;
  const fields = Array.isArray(v["fields"])
    ? (v["fields"] as unknown[]).filter((f): f is PersonalizationField =>
        FIELD_OPTIONS.some((o) => o.value === f),
      )
    : base.fields;
  return {
    level,
    framework,
    tone,
    length,

    language: typeof v["language"] === "string" && v["language"].trim() ? v["language"] : base.language,
    instructions:
      typeof v["instructions"] === "string" && v["instructions"].trim()
        ? v["instructions"]
        : base.instructions,
    fields: fields.length ? fields : base.fields,
    exampleOutput: typeof v["exampleOutput"] === "string" ? v["exampleOutput"] : "",
    fallbackMode,
    fallbackText: typeof v["fallbackText"] === "string" ? v["fallbackText"] : base.fallbackText,
  };
}

export type PersonalizationStatus = "queued" | "processing" | "completed" | "failed";

/** How much verified lead data a snippet was built from. */
export type PersonalizationQuality = "complete" | "limited" | "fallback";

export const QUALITY_LABELS: Record<PersonalizationQuality, string> = {
  complete: "Completed",
  limited: "Limited data",
  fallback: "Fallback",
};

export type PersonalizationRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: PersonalizationStatus;
  quality: PersonalizationQuality;
  data_used: string[];
  content: string | null;
  attempts: number;
  error: string | null;
  edited: boolean;
  accepted: boolean;
  created_at: string;
  completed_at: string | null;
};

export type PersonalizationStats = {
  eligible: number;
  /** Every generated snippet, whatever its quality. */
  personalized: number;
  complete: number;
  limited: number;
  fallback: number;
  /** Genuine technical failures only. */
  failed: number;
  queued: number;
  remaining: number;
  blockedReason?: string | null;
};

export type AiPersonalizationCoverageLead = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  phone: string | null;
  linkedin_url: string | null;
  custom_fields: Record<string, string> | null;
};

export type AiPersonalizationCoverage = {
  campaignId: string;
  workspaceId: string;
  total: number;
  personalized: number;
  missing: number;
  queued: number;
  failed: number;
  complete: number;
  limited: number;
  fallback: number;
  promptHashes: string[];
  sampleLeadId: string | null;
  sampleLead: AiPersonalizationCoverageLead | null;
  /** Plain-language reason generation is stalled, when there is one. */
  blockedReason: string | null;
};


export type AiUsageStats = {
  generated: number;
  failed: number;
  periodStart: string;
  periodGenerated: number;
  limit: number | null;
};

/** Does this template actually use the AI token anywhere? */
export function usesAiToken(text: string): boolean {
  return new RegExp(`\\{\\{\\s*${AI_TOKEN}\\b`).test(text);
}
