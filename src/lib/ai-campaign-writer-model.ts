/**
 * AI Campaign Writer — shared, client-safe model.
 *
 * Types and option catalogues used by both the sidebar UI and the server
 * generation module. No secrets, no provider calls, no prompts here.
 */

import { z } from "zod";

import { AI_VARIABLE_TOKEN, LEAD_VARIABLES, PAIN_POINT_MAX } from "@/lib/campaign-model";

/** Hard ceiling on a generated sequence: the initial email plus follow-ups. */
export const MAX_FOLLOW_UPS = 9;
export const MAX_SEQUENCE_STEPS = MAX_FOLLOW_UPS + 1;
export { PAIN_POINT_MAX };

export const TONES = [
  "Professional",
  "Conversational",
  "Friendly",
  "Direct",
  "Premium",
  "Founder-to-founder",
] as const;

export const STYLES = ["Short", "Balanced", "Detailed"] as const;

export const APPROACHES = [
  "Problem-focused",
  "Outcome-focused",
  "Offer-focused",
  "Insight-led",
  "Curiosity-driven",
  "Direct",
] as const;

export const CTA_TYPES = [
  "Soft CTA",
  "Question",
  "Book a call",
  "Request a reply",
  "Learn more",
  "Custom CTA",
] as const;

export const CAMPAIGN_GOALS = [
  "Book meetings",
  "Start conversations",
  "Get replies",
  "Drive signups",
  "Re-engage old leads",
] as const;

/** Rewrite presets the customer can apply to the strategy or to the copy. */
export const REFINEMENTS = [
  { key: "regenerate", label: "Regenerate", instruction: "Produce a fresh version." },
  { key: "direct", label: "Make more direct", instruction: "Be noticeably more direct and blunt. Cut hedging." },
  {
    key: "conversational",
    label: "Make more conversational",
    instruction: "Sound more human and conversational, like a short note between two people.",
  },
  { key: "premium", label: "Make more premium", instruction: "Sound more premium and considered, never salesy." },
  { key: "concise", label: "Make more concise", instruction: "Cut length hard. Keep only what earns a reply." },
  { key: "angle", label: "Try another angle", instruction: "Use a clearly different messaging angle than before." },
  { key: "improve", label: "Improve", instruction: "Tighten relevance, clarity and specificity. Remove anything generic." },
  {
    key: "cta",
    label: "Improve CTA",
    instruction: "Make the single call to action lower-friction and easier to answer, e.g. a yes/no interest question.",
  },
  {
    key: "personalization",
    label: "Improve personalization",
    instruction:
      "Use the available personalization variables more meaningfully so each one gives a reason for the email. Never add fake personalization.",
  },
] as const;

export type RefinementKey = (typeof REFINEMENTS)[number]["key"];

export type Tone = (typeof TONES)[number];
export type Style = (typeof STYLES)[number];
export type Approach = (typeof APPROACHES)[number];
export type CtaType = (typeof CTA_TYPES)[number];

/** Everything the customer tells us about what they sell. */
export const briefSchema = z.object({
  description: z.string().max(4000).default(""),
  offer: z.string().max(400).default(""),
  audience: z.string().max(400).default(""),
  industry: z.string().max(200).default(""),
  roles: z.string().max(300).default(""),
  painPoint: z.string().max(400).default(""),
  outcome: z.string().max(400).default(""),
  differentiator: z.string().max(400).default(""),
  proof: z.string().max(600).default(""),
  incentive: z.string().max(400).default(""),
  cta: z.string().max(300).default(""),
  tone: z.enum(TONES).default("Professional"),
  goal: z.string().max(200).default("Book meetings"),
});

export type WriterBrief = z.infer<typeof briefSchema>;

export const controlsSchema = z.object({
  tone: z.enum(TONES).default("Professional"),
  style: z.enum(STYLES).default("Balanced"),
  approach: z.enum(APPROACHES).default("Problem-focused"),
  ctaType: z.enum(CTA_TYPES).default("Request a reply"),
  customCta: z.string().max(200).default(""),
  /** Legacy total-step control, kept so saved campaigns keep hydrating. */
  steps: z.number().int().min(1).max(MAX_SEQUENCE_STEPS).default(4),
  /** How many follow-ups after the initial email. Authoritative going forward. */
  followUps: z.number().int().min(0).max(MAX_FOLLOW_UPS).default(3),
  /** How many pain points the AI writes for EACH lead (0 = none). */
  painPointsPerLead: z.number().int().min(0).max(PAIN_POINT_MAX).default(0),
});

/** Total emails in the sequence: the initial email plus the chosen follow-ups. */
export function totalSteps(controls: Pick<WriterControls, "followUps">): number {
  return Math.min(MAX_SEQUENCE_STEPS, Math.max(1, controls.followUps + 1));
}

export type WriterControls = z.infer<typeof controlsSchema>;

export const strategySchema = z.object({
  angle: z.string(),
  valueProposition: z.string(),
  painPoint: z.string(),
  offer: z.string(),
  ctaStrategy: z.string(),
  tone: z.string(),
  messagingStyle: z.string(),
  personalization: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  proofStatus: z.string().default(""),
  /** The opening hook used in email one. */
  hook: z.string().default(""),
  /** How the sequence progresses step to step. */
  sequenceStrategy: z.string().default(""),
  /** Follow-ups the strategist recommends for this objective (advisory). */
  recommendedFollowUps: z.number().int().min(0).max(MAX_FOLLOW_UPS).nullable().default(null),
});

export type WriterStrategy = z.infer<typeof strategySchema>;

export const angleSchema = z.object({
  name: z.string(),
  summary: z.string(),
  whyItWorks: z.string(),
});

export type WriterAngle = z.infer<typeof angleSchema>;

export const offerAdviceSchema = z.object({
  current: z.string(),
  recommended: z.string(),
  why: z.array(z.string()).default([]),
  missingProof: z.boolean().default(false),
});

export type OfferAdvice = z.infer<typeof offerAdviceSchema>;

export const writerStepSchema = z.object({
  purpose: z.string(),
  subject: z.string(),
  body: z.string(),
  waitDays: z.number().int().min(0).max(30).default(3),
  /** Alternative subject lines the customer can pick from. */
  subjectOptions: z.array(z.string()).default([]),
});

/** Phrases that make cold email read as generic, spammy or AI-written. */
export const WEAK_PHRASES = [
  "i hope you're doing well",
  "i hope you are doing well",
  "i hope this email finds you well",
  "hope this finds you well",
  "revolutionize",
  "unlock your potential",
  "exclusive opportunity",
  "limited time offer",
  "act now",
  "game-changer",
  "game changer",
  "cutting-edge",
  "synergy",
  "leverage our",
  "world-class",
  "best-in-class",
  "guaranteed",
  "i came across your profile and was impressed",
  "just following up",
  "just checking in",
  "circling back",
];

const WORD_LIMIT: Record<Style, number> = { Short: 90, Balanced: 140, Detailed: 220 };

/**
 * Deterministic self-review of one generated email. Returns concrete problems;
 * an empty list means it passes. Used to trigger one rewrite before returning.
 */
export function lintStep(
  step: { subject: string; body: string },
  opts: { style: Style; previous?: Array<{ body: string }> },
): string[] {
  const issues: string[] = [];
  const body = step.body.toLowerCase();
  const subject = step.subject.toLowerCase();
  for (const phrase of WEAK_PHRASES) {
    if (body.includes(phrase) || subject.includes(phrase)) issues.push(`Remove the phrase "${phrase}".`);
  }
  const words = step.body.split(/\s+/).filter(Boolean).length;
  if (words > WORD_LIMIT[opts.style]) issues.push(`Too long (${words} words); keep it under ${WORD_LIMIT[opts.style]}.`);
  if (step.subject.split(/\s+/).filter(Boolean).length > 8) issues.push("Subject line is too long; keep it under 8 words.");
  if (/!{1,}/.test(step.subject)) issues.push("No exclamation marks in the subject.");
  const questions = (step.body.match(/\?/g) ?? []).length;
  if (questions > 2) issues.push("Too many questions — keep one clear call to action.");
  const longParagraph = step.body.split(/\n\s*\n/).some((p) => p.split(/\s+/).length > 60);
  if (longParagraph) issues.push("Break up long paragraphs; keep each to two or three short sentences.");
  for (const prev of opts.previous ?? []) {
    const a = new Set(prev.body.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    const b = body.split(/\W+/).filter((w) => w.length > 4);
    if (b.length > 15 && a.size) {
      const overlap = b.filter((w) => a.has(w)).length / b.length;
      if (overlap > 0.6) {
        issues.push("Too similar to an earlier email — use a different angle.");
        break;
      }
    }
  }
  return issues;
}

export type WriterStep = z.infer<typeof writerStepSchema>;

export const reviewSchema = z.object({
  score: z.number().min(0).max(100).default(0),
  summary: z.string().default(""),
  issues: z
    .array(z.object({ label: z.string(), detail: z.string(), severity: z.enum(["low", "medium", "high"]).default("medium") }))
    .default([]),
});

export type WriterReview = z.infer<typeof reviewSchema>;

/** Persisted per campaign so the customer can come back to their work. */
export const writerStateSchema = z.object({
  brief: briefSchema.partial().default({}),
  controls: controlsSchema.partial().default({}),
  strategy: strategySchema.nullable().default(null),
  angles: z.array(angleSchema).default([]),
  selectedAngle: z.string().nullable().default(null),
  offerAdvice: offerAdviceSchema.nullable().default(null),
  steps: z.array(writerStepSchema).default([]),
  review: reviewSchema.nullable().default(null),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});

export type WriterState = z.infer<typeof writerStateSchema>;

export const emptyWriterState = (): WriterState => ({
  brief: {},
  controls: {},
  strategy: null,
  angles: [],
  selectedAngle: null,
  offerAdvice: null,
  steps: [],
  review: null,
  provider: null,
  model: null,
  updatedAt: null,
});

export function normalizeWriterState(raw: unknown): WriterState {
  const parsed = writerStateSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : emptyWriterState();
}

export const defaultBrief = (): WriterBrief => briefSchema.parse({});
export const defaultControls = (): WriterControls => controlsSchema.parse({});

/** What each step in a sequence is for — keeps follow-ups from repeating step one. */
export function stepPurposes(count: number): string[] {
  const middle = [
    "New angle on the same problem — a different reason to care",
    "Address a likely objection or risk",
    "Add a second pain point or a concrete outcome",
    "Short insight or observation, no pitch",
    "Restate the offer with a lower-friction ask",
  ];
  const purposes = ["Open the conversation: problem, value and a light ask"];
  for (let i = 0; i < Math.max(0, count - 2); i += 1) {
    purposes.push(middle[i % middle.length]!);
  }
  if (count > 1) purposes.push("Low-pressure close: permission-based ask");
  return purposes.slice(0, count);
}

/**
 * Strips any variable the platform does not support, so generated copy can never
 * break at send time. Unknown tokens keep their text but lose the braces.
 */
export function sanitizeVariables(text: string): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, token: string) => {
    const normalized = token.toLowerCase();
    const known =
      LEAD_VARIABLES.some((v) => v.token === normalized) || normalized === "unsubscribe_link";
    return known ? `{{${normalized}}}` : match.replace(/\{\{|\}\}/g, "");
  });
}

/**
 * Variables the AI Campaign Writer may write. {{ai_personalization}} belongs to
 * the separate AI Personalizer and is never offered to (or kept from) the writer.
 */
export const WRITER_SYSTEM_TOKENS: string[] = LEAD_VARIABLES.map((v) => v.token).filter(
  (t) => t !== AI_VARIABLE_TOKEN,
);

/**
 * Writer-only sanitizer: keeps system variables and the campaign's own custom
 * variables exactly (including any `| fallback`), removes {{ai_personalization}}
 * outright, and strips braces from anything unsupported.
 */
export function sanitizeWriterVariables(text: string, customTokens: string[] = []): string {
  const allowed = new Set([...WRITER_SYSTEM_TOKENS, "unsubscribe_link", ...customTokens.map((t) => t.toLowerCase())]);
  const out = text.replace(/\{\{\s*([a-z0-9_]+)\s*(\|[^}]*)?\}\}/gi, (match, token: string, fallback?: string) => {
    const normalized = token.toLowerCase();
    if (normalized === AI_VARIABLE_TOKEN) return "";
    if (allowed.has(normalized)) return fallback ? `{{${normalized} ${fallback.trim()}}}` : `{{${normalized}}}`;
    return (fallback ? fallback.replace(/^\|\s*/, "") : token).trim();
  });
  // Tidy whitespace left where a removed token used to be.
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
