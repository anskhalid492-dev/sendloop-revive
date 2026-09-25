/**
 * AI Campaign Writer — prompt building and response parsing.
 *
 * Every model call goes through `generateWithWorkspaceAi` in
 * `ai-personalization.server.ts`, so provider branching, key decryption and
 * customer-facing error mapping stay in exactly one place. Generation is split
 * into small bounded calls (strategy, angles, offer advice, one sequence step at
 * a time, review) — never one huge request — and this module never sends email.
 */

import type { WorkspaceAiCredentials } from "@/lib/ai-keys.server";
import { generateWithWorkspaceAi, AiGatewayError } from "@/lib/ai-personalization.server";
import { LEAD_VARIABLES } from "@/lib/campaign-model";
import {
  angleSchema,
  offerAdviceSchema,
  reviewSchema,
  strategySchema,
  writerStepSchema,
  type OfferAdvice,
  type WriterAngle,
  type WriterBrief,
  type WriterControls,
  type WriterReview,
  type WriterStep,
  type WriterStrategy,
  sanitizeVariables,
  lintStep,
} from "@/lib/ai-campaign-writer-model";

/** Only variables MunchReach actually supports may appear in generated copy. */
const SUPPORTED_TOKENS = LEAD_VARIABLES.map((v) => `{{${v.token}}}`);

const GROUND_RULES = [
  "You are an experienced B2B outbound strategist and copywriter writing for a real sending platform.",
  "Write like a smart salesperson who personally wrote this after basic research: relevant, specific, credible, conversational.",
  "Short sentences. One clear idea per email. One primary, low-friction call to action. Low cognitive load. A clear reason for reaching out.",
  "Never: generic introductions, 'I hope you're doing well', fake compliments, corporate fluff, buzzwords, stacked adjectives, long company descriptions, big paragraphs, fake urgency or scarcity, multiple competing CTAs, or promises of guaranteed replies or meetings.",
  "Never invent customer results, testimonials, statistics, guarantees, certifications, awards, company facts, funding, revenue, technologies or achievements. If proof was not provided, say proof is missing instead of creating any.",
  `The only personalization variables that exist are: ${SUPPORTED_TOKENS.join(", ")}. Never invent other variables.`,
  "Use a variable only where it gives the sentence a real reason to exist — never stuff them in. Every variable may be empty for some leads, so the sentence must still read naturally.",
  "Adapt pain point, vocabulary, proof and CTA to the target role (a CFO cares about cost and risk, a VP Sales about pipeline, a CTO about reliability and engineering time).",
  "Prefer CTAs like 'Open to taking a look?', 'Worth a quick chat?', 'Want me to send an example?' over asking for a 30-minute meeting, unless the brief asks for one.",
  "Never expose your reasoning. Return only the requested JSON.",
  "No spam words, no emoji, no clickbait subject lines.",
].join("\n");

function briefBlock(brief: WriterBrief): string {
  const lines: Array<[string, string]> = [
    ["What they sell / context", brief.description],
    ["Offer or product", brief.offer],
    ["Target audience", brief.audience],
    ["Industry", brief.industry],
    ["Job titles / roles", brief.roles],
    ["Main pain point", brief.painPoint],
    ["Desired outcome", brief.outcome],
    ["Unique differentiator", brief.differentiator],
    ["Proof / results provided by the customer", brief.proof],
    ["Offer / incentive", brief.incentive],
    ["Preferred call to action", brief.cta],
    ["Tone", brief.tone],
    ["Campaign goal", brief.goal],
  ];
  const filled = lines.filter(([, value]) => value && value.trim().length > 0);
  if (!filled.length) return "The customer gave no information yet.";
  return filled.map(([label, value]) => `${label}: ${value.trim()}`).join("\n");
}

function controlsBlock(controls: WriterControls): string {
  const cta =
    controls.ctaType === "Custom CTA" && controls.customCta.trim()
      ? `Custom CTA: ${controls.customCta.trim()}`
      : `CTA type: ${controls.ctaType}`;
  return [
    `Tone: ${controls.tone}`,
    `Length style: ${controls.style}`,
    `Approach: ${controls.approach}`,
    cta,
  ].join("\n");
}

/** Models sometimes wrap JSON in prose or fences — pull the object out. */
export function parseJsonObject(raw: string): unknown {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw malformed();
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw malformed();
  }
}

function parseJsonArray(raw: string): unknown[] {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) {
    // Some models wrap the list in an object — accept {"angles": [...]}.
    const object = parseJsonObject(raw) as Record<string, unknown>;
    const list = Object.values(object).find((value) => Array.isArray(value));
    if (Array.isArray(list)) return list;
    throw malformed();
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw malformed();
    return parsed;
  } catch {
    throw malformed();
  }
}

function malformed() {
  return new AiGatewayError({
    status: 502,
    message: "The AI returned a response we could not read. Try generating again.",
    retryable: true,
  });
}

async function call(
  credentials: WorkspaceAiCredentials,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  return generateWithWorkspaceAi({ credentials, system: GROUND_RULES, prompt, maxTokens });
}

export async function generateStrategy(input: {
  credentials: WorkspaceAiCredentials;
  brief: WriterBrief;
  controls: WriterControls;
  angle?: string | null;
  refinement?: string | null;
}): Promise<WriterStrategy> {
  const prompt = [
    "Work out the strategy for one cold outreach campaign, then return it.",
    "First think privately about: the target customer, their role, their current situation, the real problem, the outcome they want, how this offer solves it, the strongest differentiator, how strong the offer is, why they might hesitate, likely objections, which proof is genuinely available, the best call to action and where personalization would help.",
    "Then return ONLY this JSON:",
    `{"angle":"...","valueProposition":"...","painPoint":"...","hook":"...","sequenceStrategy":"...","recommendedFollowUps":3,"offer":"...","ctaStrategy":"...","tone":"...","messagingStyle":"...","personalization":["..."],"objections":["..."],"proofStatus":"..."}`,
    "Each string is one short sentence or phrase — no explanations of your thinking. proofStatus says what proof exists, or states plainly that no proof was provided.",
    "hook is the opening idea of email one. sequenceStrategy describes how each follow-up adds something new. recommendedFollowUps (0-9) is how many follow-ups this objective genuinely needs — do not default to the maximum.",
    "personalization lists which lead signals (job title, company, website/description, industry, funding, tech stack, location…) would make the strongest reason to write, in priority order.",
    "",
    "Customer information:",
    briefBlock(input.brief),
    "",
    "Requested controls:",
    controlsBlock(input.controls),
    input.angle ? `\nUse this messaging angle: ${input.angle}` : "",
    input.refinement ? `\nAdjustment: ${input.refinement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = strategySchema.safeParse(parseJsonObject(await call(input.credentials, prompt, 900)));
  if (!parsed.success) throw malformed();
  return parsed.data;
}

export async function generateAngles(input: {
  credentials: WorkspaceAiCredentials;
  brief: WriterBrief;
  count?: number;
}): Promise<WriterAngle[]> {
  const count = input.count ?? 4;
  const prompt = [
    `Propose ${count} genuinely different messaging angles for this offer. Choose angles that actually fit — do not force a standard list.`,
    `Return ONLY a JSON array: [{"name":"...","summary":"...","whyItWorks":"..."}]`,
    "summary is one sentence describing the angle. whyItWorks is one short sentence.",
    "",
    "Customer information:",
    briefBlock(input.brief),
  ].join("\n");
  const list = parseJsonArray(await call(input.credentials, prompt, 700));
  const angles = list
    .map((item) => angleSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => (r as { data: WriterAngle }).data);
  if (!angles.length) throw malformed();
  return angles.slice(0, 6);
}

export async function improveOffer(input: {
  credentials: WorkspaceAiCredentials;
  brief: WriterBrief;
}): Promise<OfferAdvice> {
  const prompt = [
    "Improve this customer's offer. Sharpen clarity, value proposition, positioning, the desired outcome, differentiation, risk reversal where honest, the call to action and any incentive.",
    "If no proof was provided, do NOT invent any — set missingProof true and say what proof would strengthen it.",
    `Return ONLY this JSON: {"current":"...","recommended":"...","why":["...","..."],"missingProof":true|false}`,
    "current summarises their offer as it stands. recommended is the stronger version, written as they could actually say it. why has two to four short reasons.",
    "",
    "Customer information:",
    briefBlock(input.brief),
  ].join("\n");
  const parsed = offerAdviceSchema.safeParse(parseJsonObject(await call(input.credentials, prompt, 800)));
  if (!parsed.success) throw malformed();
  return parsed.data;
}

/** One sequence step at a time — bounded requests, no giant synchronous generation. */
export async function generateStep(input: {
  credentials: WorkspaceAiCredentials;
  brief: WriterBrief;
  controls: WriterControls;
  strategy: WriterStrategy;
  index: number;
  total: number;
  purpose: string;
  previous: WriterStep[];
  refinement?: string | null;
  /** The version being recreated, so the new one is genuinely different. */
  avoid?: string | null;
}): Promise<WriterStep> {
  const history = input.previous.length
    ? input.previous
        .map((s, i) => `Step ${i + 1} (${s.purpose})\nSubject: ${s.subject}\n${s.body}`)
        .join("\n\n")
    : "None yet — this is the first email.";
  const prompt = [
    `Write step ${input.index + 1} of ${input.total} in a cold outreach sequence.`,
    `Purpose of this step: ${input.purpose}`,
    input.index === 0
      ? "The first email states the problem or opportunity, gives the value proposition, explains it briefly and ends with the call to action."
      : "This is a follow-up. It must NOT restate the earlier emails in different words — it adds a new reason to reply.",
    input.index === input.total - 1 && input.total > 1
      ? "This is the final follow-up: low pressure, permission-based close."
      : "",
    `Return ONLY this JSON: {"purpose":"...","subject":"...","subjectOptions":["...","...","..."],"body":"...","waitDays":3}`,
    "waitDays is days to wait before this step (0 for the first step). Body is plain text with line breaks, no signature block, no HTML.",
    "subject and subjectOptions: short (2-6 words), natural, relevant, lower-key, never clickbait. subjectOptions gives three genuinely different alternatives.",
    input.index > 0 ? "Follow-ups may keep the thread feel; a follow-up can be very short (2-4 sentences)." : "",
    "",
    "Campaign strategy:",
    `Angle: ${input.strategy.angle}`,
    `Value proposition: ${input.strategy.valueProposition}`,
    `Primary pain point: ${input.strategy.painPoint}`,
    `Offer: ${input.strategy.offer}`,
    `CTA strategy: ${input.strategy.ctaStrategy}`,
    input.strategy.objections.length ? `Likely objections: ${input.strategy.objections.join("; ")}` : "",
    "",
    "Controls:",
    controlsBlock(input.controls),
    "",
    "Customer information:",
    briefBlock(input.brief),
    "",
    "Earlier steps in this sequence:",
    history,
    // Pain point variables were removed: write the pain point as real sentences.
    [
      "",
      "Never write a {{pain_point}} variable or any pain point placeholder. Write the pain point out as a real sentence in the copy.",
    ].join("\n"),
    input.avoid
      ? [
          "",
          "You are RECREATING this email. Produce a genuinely different version: a new subject line, a different opening, a different structure and a different argument order. Do not reuse its sentences or swap a few words.",
          "Keep the same audience, objective, offer, tone, personalization variables and purpose.",
          "Version to replace:",
          input.avoid.slice(0, 4000),
        ].join("\n")
      : "",
    input.refinement ? `\nAdjustment: ${input.refinement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = writerStepSchema.safeParse(parseJsonObject(await call(input.credentials, prompt, 900)));
  if (!parsed.success) throw malformed();
  let step = parsed.data;

  // Self-review: if the draft fails a major quality check, rewrite it once
  // with the concrete problems before returning. Only the result is returned.
  const issues = lintStep(step, { style: input.controls.style, previous: input.previous });
  if (issues.length) {
    const rewritePrompt = [
      prompt,
      "",
      "Your draft failed these quality checks. Rewrite it so none apply, keeping the same purpose:",
      ...issues.map((i) => `- ${i}`),
      "Draft:",
      `Subject: ${step.subject}\n${step.body}`,
    ].join("\n");
    try {
      const retry = writerStepSchema.safeParse(
        parseJsonObject(await call(input.credentials, rewritePrompt, 900)),
      );
      if (retry.success) step = retry.data;
    } catch (error) {
      // Keep the first draft on a malformed rewrite; surface real provider errors.
      if (!(error instanceof AiGatewayError) || error.status !== 502) throw error;
    }
  }

  return {
    ...step,
    subject: sanitizeVariables(step.subject).slice(0, 200),
    subjectOptions: Array.from(
      new Set([step.subject, ...step.subjectOptions].map((s) => sanitizeVariables(s).trim().slice(0, 200)).filter(Boolean)),
    ).slice(0, 4),
    body: sanitizeVariables(step.body),
    waitDays: input.index === 0 ? 0 : Math.max(1, step.waitDays),
  };
}

export async function reviewCampaign(input: {
  credentials: WorkspaceAiCredentials;
  brief: WriterBrief;
  strategy: WriterStrategy;
  steps: WriterStep[];
}): Promise<WriterReview> {
  const prompt = [
    "Review this outreach campaign honestly and briefly. Check for: weak offer, generic messaging, unclear value proposition, weak call to action, excessive length, repetition between steps, too many claims, unsupported claims, missed personalization opportunities, no differentiation, and follow-ups that just repeat the first email.",
    `Return ONLY this JSON: {"score":0-100,"summary":"one or two sentences","issues":[{"label":"short name","detail":"one sentence","severity":"low|medium|high"}]}`,
    "Only list issues that are really present. If the campaign is strong, return few or no issues.",
    "",
    "Offer information:",
    briefBlock(input.brief),
    "",
    "Strategy:",
    `${input.strategy.angle} | ${input.strategy.valueProposition} | ${input.strategy.ctaStrategy}`,
    "",
    "Emails:",
    input.steps.map((s, i) => `Step ${i + 1}: ${s.subject}\n${s.body}`).join("\n\n"),
  ].join("\n");
  const parsed = reviewSchema.safeParse(parseJsonObject(await call(input.credentials, prompt, 800)));
  if (!parsed.success) throw malformed();
  return parsed.data;
}
