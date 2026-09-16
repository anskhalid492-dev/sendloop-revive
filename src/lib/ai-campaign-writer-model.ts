/**
 * AI Campaign Writer — shared, client-safe model.
 *
 * Types and option catalogues used by both the sidebar UI and the server
 * generation module. No secrets, no provider calls, no prompts here.
 */

import { z } from "zod";

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
  steps: z.number().int().min(3).max(7).default(4),
});

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
});

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
  ];
  const purposes = ["Open the conversation: problem, value and a light ask"];
  for (let i = 0; i < Math.max(0, count - 2); i += 1) {
    purposes.push(middle[i % middle.length]!);
  }
  if (count > 1) purposes.push("Low-pressure close: permission-based ask");
  return purposes.slice(0, count);
}
