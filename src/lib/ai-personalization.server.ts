/**
 * Server-only AI personalization engine.
 *
 * Bring-your-own key: each workspace connects its own OpenAI API key and is
 * billed by OpenAI directly. MunchReach never supplies model credentials — the
 * key is decrypted here, used for the call, and never leaves the server.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

import type { WorkspaceAiCredentials } from "@/lib/ai-keys.server";
import { aiProvider } from "@/lib/ai-providers";
import {
  AI_TOKEN,
  PAIN_POINT_MAX,
  painPointToken,
  frameworkGuidance,
  normalizeAiConfig,
  type AiPersonalizationConfig,
  type PersonalizationField,
} from "@/lib/ai-personalization-model";
import {
  aiExtras,
  LEAD_AI_COLUMNS,
  personalizationByLead,
  promptFingerprint,
} from "@/lib/ai-personalization-meta.server";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const RUNNER_KEY = "ai_personalization";
/**
 * Hard ceiling per worker run so a big list never becomes an unbounded request
 * storm, and how many of those generations run at the same time. Generation is
 * network-bound, so a wide-but-capped pool turns a 1,000-lead list from an
 * hour-long trickle into a handful of seconds per run.
 */
const BATCH_SIZE = 50;
const CONCURRENCY = 5;

/** Run `worker` over `items` with a bounded number of in-flight calls. */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}


export type GatewayFailure = { status: number; message: string; retryable: boolean };

export class AiGatewayError extends Error {
  status: number;
  retryable: boolean;
  constructor(failure: GatewayFailure) {
    super(failure.message);
    this.status = failure.status;
    this.retryable = failure.retryable;
  }
}

function provider(credentials: WorkspaceAiCredentials) {
  if (!credentials?.apiKey)
    throw new AiGatewayError({
      status: 401,
      message: `No ${vendorOf(credentials)} API key is connected for this workspace.`,
      retryable: false,
    });
  return createOpenAICompatible({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
  });
}

/**
 * OpenAI chat call with the customer's exact model. Some OpenAI models reject
 * sampling/length parameters; when the provider says so we retry ONCE with the
 * same model and without them — the model itself is never changed.
 */
async function generateWithOpenAi(
  credentials: WorkspaceAiCredentials,
  input: { system: string; prompt: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  const model = provider(credentials)(credentials.model);
  try {
    const result = await generateText({
      model,
      system: input.system,
      prompt: input.prompt,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
      maxRetries: 0,
    });
    return (result.text ?? "").trim();
  } catch (error) {
    const raw = error as { statusCode?: number; message?: string; responseBody?: string };
    const detail = `${raw?.message ?? ""} ${raw?.responseBody ?? ""}`;
    if (raw?.statusCode === 400 && /unsupported (parameter|value)/i.test(detail)) {
      const result = await generateText({
        model,
        system: input.system,
        prompt: input.prompt,
        maxRetries: 0,
      });
      return (result.text ?? "").trim();
    }
    throw error;
  }
}

export function vendorOf(credentials: Pick<WorkspaceAiCredentials, "provider">): string {
  return aiProvider(credentials?.provider).vendor;
}

/**
 * Anthropic Messages API call (docs.anthropic.com/en/api/messages).
 *
 * Claude is not OpenAI-compatible, so it gets its own documented request shape
 * rather than being forced through the OpenAI-compatible adapter.
 */
async function generateWithAnthropic(input: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 400,
      temperature: input.temperature ?? 0.6,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      detail = "";
    }
    throw new AiGatewayError(
      anthropicFailure(res.status, detail || `Claude returned HTTP ${res.status}.`, input.model),
    );
  }
  const body = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  return (body.content ?? [])
    .filter((part) => part?.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

/** Exact message when the chosen model is not usable — never auto-substituted. */
export function modelUnavailableMessage(vendor: string, model: string): string {
  return `The selected ${vendor} model "${model}" is not available to your API key. Open AI Personalization or Integrations, click Refresh models and choose another model.`;
}

function looksLikeMissingModel(status: number, message: string): boolean {
  if (status === 404) return true;
  return (status === 400 || status === 403) && /model/i.test(message) && /(not[ _]found|does not exist|not available|no access|do not have access|invalid model)/i.test(message);
}

/** Refuse to call a provider without an explicitly selected model. */
export function assertModelSelected(credentials: WorkspaceAiCredentials): void {
  if (!credentials?.model?.trim()) {
    throw new AiGatewayError({
      status: 409,
      message: `No ${aiProvider(credentials?.provider).label} model is selected. Open AI Personalization or Integrations, click Refresh models and choose a model.`,
      retryable: false,
    });
  }
}

function anthropicFailure(status: number, message: string, model = ""): GatewayFailure {
  if (looksLikeMissingModel(status, message))
    return { status: 404, message: modelUnavailableMessage("Anthropic", model), retryable: false };
  if (status === 401 || status === 403)
    return {
      status,
      message: "Your Anthropic API key was rejected. Reconnect it in the AI tab.",
      retryable: false,
    };
  if (status === 429)
    return {
      status,
      message:
        "Claude rate limited this workspace. Remaining leads stay queued and retry automatically.",
      retryable: true,
    };
  if (status === 400 && /credit|billing/i.test(message))
    return {
      status: 402,
      message: "Your Anthropic account has no available credit. Add billing in Anthropic and retry.",
      retryable: false,
    };
  if (status === 400)
    return { status, message: `Claude rejected the request: ${message}`, retryable: false };
  if (status === 529 || status >= 500)
    return {
      status,
      message: "Claude is temporarily unavailable. Remaining leads retry automatically.",
      retryable: true,
    };
  return { status, message, retryable: false };
}

export type LeadRecord = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  company?: string | null;
  website?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  company_description?: string | null;
  notes?: string | null;
  custom_fields?: Record<string, string> | null;
};

/**
 * Attach the most recent lead notes so "Lead notes" personalization has real
 * material. Notes live in their own table and are workspace-scoped by RLS.
 */
export async function attachLeadNotes(
  supabase: Client,
  leads: LeadRecord[],
): Promise<LeadRecord[]> {
  if (!leads.length) return leads;
  const { data } = await supabase
    .from("lead_notes")
    .select("lead_id, body, created_at")
    .in(
      "lead_id",
      leads.map((l) => l.id),
    )
    .order("created_at", { ascending: false });
  const byLead = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ lead_id: string; body: string }>) {
    if (!byLead.has(row.lead_id) && row.body?.trim()) byLead.set(row.lead_id, row.body.trim());
  }
  return leads.map((lead) => ({ ...lead, notes: byLead.get(lead.id) ?? lead.notes ?? null }));
}

const LEVEL_FIELD_LIMIT: Record<AiPersonalizationConfig["level"], number> = {
  light: 4,
  balanced: 7,
  deep: 20,
};

/**
 * Build the fact list handed to the model — only fields that actually hold data
 * for this lead, so the model has nothing to invent from.
 */
export function leadFacts(
  lead: LeadRecord,
  fields: PersonalizationField[],
  level: AiPersonalizationConfig["level"],
): Array<{ label: string; value: string }> {
  const custom = lead.custom_fields ?? {};
  const location = [lead.city, lead.state, lead.country].filter(Boolean).join(", ");
  const candidates: Array<{
    field: PersonalizationField;
    label: string;
    value: string | null | undefined;
  }> = [
    { field: "first_name", label: "First name", value: lead.first_name },
    { field: "last_name", label: "Last name", value: lead.last_name },
    { field: "job_title", label: "Job title", value: lead.job_title },
    { field: "company", label: "Company", value: lead.company },
    { field: "website", label: "Website", value: lead.website },
    { field: "industry", label: "Industry", value: lead.industry ?? custom["industry"] },
    { field: "location", label: "Location", value: location },
    {
      field: "company_description",
      label: "Company description",
      value: lead.company_description ?? custom["company_description"] ?? custom["description"],
    },
    { field: "notes", label: "Lead notes", value: lead.notes ?? custom["notes"] },
  ];

  const out = candidates
    .filter((c) => fields.includes(c.field) && !isBlankValue(c.value))
    .map((c) => ({ label: c.label, value: String(c.value).trim().slice(0, 400) }));

  if (fields.includes("custom_fields")) {
    // Recognised firmographic signals (funding, revenue, tech stack, headcount…)
    // come first so the field limit never cuts the strongest reasons to write.
    const { signals, consumedKeys } = extractSignals(custom);
    const signalFacts = signals.map((s) => ({
      label: s.handling === "indirect" ? `${s.label} (sensitive — reference indirectly only)` : s.label,
      value: s.value,
    }));
    const rest: Array<{ label: string; value: string }> = [];
    for (const [key, value] of Object.entries(custom)) {
      if (consumedKeys.has(key)) continue;
      if (["industry", "company_description", "description", "notes"].includes(key)) continue;
      if (isBlankValue(value)) continue;
      rest.push({ label: key.replace(/_/g, " "), value: String(value).trim().slice(0, 200) });
    }
    const limit = LEVEL_FIELD_LIMIT[level];
    return [...out, ...signalFacts, ...rest].slice(0, Math.max(limit, out.length + signalFacts.length));
  }

  return out.slice(0, LEVEL_FIELD_LIMIT[level]);
}

/** Role steering for the prompt, derived only from the lead's real job title. */
export function roleHint(facts: Array<{ label: string; value: string }>): string | null {
  const title = facts.find((f) => f.label === "Job title")?.value;
  if (!title) return null;
  return ROLE_GUIDANCE[roleFamily(title)];
}

const LENGTH_RULE: Record<AiPersonalizationConfig["length"], string> = {
  one_line: "Write exactly one sentence, at most 25 words.",
  two_lines: "Write at most two sentences, at most 45 words in total.",
  short_paragraph: "Write at most three sentences, at most 70 words in total.",
};

export function buildPrompt(
  config: AiPersonalizationConfig,
  facts: Array<{ label: string; value: string }>,
): { system: string; prompt: string } {
  const system = [
    "You write the opening personalization line of a cold outreach email.",
    "Absolute rules:",
    "- Use ONLY the facts provided below. Nothing else is known about this prospect.",
    "- Never invent or imply company news, funding, achievements, awards, metrics, events, products, technologies or mutual connections.",
    "- Never guess industry, size, location or anything not listed.",
    "- No greeting, no sign-off, no subject line, no quotes, no markdown, no placeholders or brackets.",
    "- Do not mention that you are an AI or that data was provided.",
    `- Write in ${config.language}.`,
    `- Tone: ${config.tone}.`,
    `- Angle: ${frameworkGuidance(config.framework)}`,
    `- ${LENGTH_RULE[config.length]}`,
    "- Thin data is normal. With only a name, or only a company, write a short, conservative, truthful line using just that. Never refuse.",
    "",
    'Reply with JSON only, in this exact shape: {"personalization": string, "confidence": "high" | "medium" | "low", "data_used": string[]}',
    '"data_used" lists the fact labels you actually used. "personalization" must never be empty.',
    ...(config.painPointsPerLead > 0
      ? [
          "",
          `Also add "pain_points": an array of exactly ${config.painPointsPerLead} short phrases naming pain points THIS specific business plausibly has, based only on the facts provided.`,
          'Each pain point is one clause that can be dropped straight into a sentence such as "One thing I noticed is <pain point>." — lower case, no leading "that", no full stop, at most 20 words.',
          "Never invent internal details, numbers or events. Keep each pain point clearly different from the others.",
        ]
      : []),
  ].join("\n");


  const factLines = facts.length
    ? facts.map((f) => `- ${f.label}: ${f.value}`).join("\n")
    : "- (no data available)";

  const prompt = [
    `Campaign instructions from the sender:\n${config.instructions.trim()}`,
    config.exampleOutput.trim()
      ? `Example of the desired style (do not copy its facts):\n${config.exampleOutput.trim()}`
      : "",
    `Known facts about the prospect:\n${factLines}`,
    "Return only the JSON object.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}

/** Best-effort JSON extraction — models occasionally wrap JSON in prose or fences. */
function parseStructured(raw: string): {
  personalization: string;
  confidence: string;
  dataUsed: string[];
  painPoints: string[];
} | null {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const personalization = typeof parsed["personalization"] === "string" ? parsed["personalization"] : "";
    if (!personalization.trim()) return null;
    const confidence =
      typeof parsed["confidence"] === "string" ? parsed["confidence"].toLowerCase() : "medium";
    const dataUsed = Array.isArray(parsed["data_used"])
      ? (parsed["data_used"] as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 12)
      : [];
    const painPoints = Array.isArray(parsed["pain_points"])
      ? (parsed["pain_points"] as unknown[])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.replace(/^["'`\s]+|["'`\s.]+$/g, "").replace(/\s+/g, " ").trim())
          .filter((v) => v && !/\{\{|\[\[/.test(v))
          .map((v) => v.slice(0, 200))
          .slice(0, PAIN_POINT_MAX)
      : [];
    return { personalization, confidence, dataUsed, painPoints };
  } catch {
    return null;
  }
}


function mapGatewayError(error: unknown, vendor = "OpenAI", model = ""): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const raw = error as { statusCode?: number; status?: number; message?: string; responseBody?: string };
  const status = raw?.statusCode ?? raw?.status ?? 0;
  const message = raw?.message ?? "AI generation failed.";
  if (looksLikeMissingModel(status, `${message} ${raw?.responseBody ?? ""}`))
    return new AiGatewayError({ status: 404, message: modelUnavailableMessage(vendor, model), retryable: false });
  if (status === 402 || status === 429)
    return new AiGatewayError({
      status,
      message:
        status === 402
          ? `Your ${vendor} account has no available credit. Add billing in ${vendor} and retry.`
          : `${vendor} rate limited this workspace. Remaining leads stay queued and retry automatically.`,
      retryable: status === 429,
    });
  if (status === 403)
    return new AiGatewayError({
      status,
      message: `${vendor} blocked this request for your key.`,
      retryable: false,
    });
  if (status === 401)
    return new AiGatewayError({
      status,
      message: `Your ${vendor} API key was rejected. Reconnect it in the AI tab.`,
      retryable: false,
    });
  if (status === 400)
    return new AiGatewayError({
      status,
      message: `${vendor} rejected the request: ${message}`,
      retryable: false,
    });
  return new AiGatewayError({ status: status || 500, message, retryable: true });
}

/**
 * One raw completion with the workspace's own AI key.
 *
 * This is the shared gateway every AI writing feature uses (personalization and
 * the AI Campaign Writer), so provider branching, key handling and the
 * customer-facing error mapping exist in exactly one place.
 */
export async function generateWithWorkspaceAi(input: {
  credentials: WorkspaceAiCredentials;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const { credentials, system, prompt } = input;
  const maxTokens = input.maxTokens ?? 1200;
  const temperature = input.temperature ?? 0.6;
  assertModelSelected(credentials);
  try {
    if (credentials.provider === "anthropic") {
      if (!credentials.apiKey)
        throw new AiGatewayError({
          status: 401,
          message: "No Anthropic API key is connected for this workspace.",
          retryable: false,
        });
      return await generateWithAnthropic({
        apiKey: credentials.apiKey,
        model: credentials.model,
        system,
        prompt,
        maxTokens,
        temperature,
      });
    }
    return await generateWithOpenAi(credentials, { system, prompt, temperature, maxTokens });
  } catch (error) {
    throw mapGatewayError(error, vendorOf(credentials), credentials.model);
  }
}

/** How much verified material the snippet was built from. */
export type PersonalizationQuality = "complete" | "limited" | "fallback";

export type GenerationResult = {
  content: string;
  model: string;
  quality: PersonalizationQuality;
  dataUsed: string[];
  /** One pain point per requested slot, written for THIS lead only. */
  painPoints: string[];
};

/**
 * One generation call with the workspace's own key.
 *
 * Thin lead data is NEVER a failure: the model is asked to stay conservative and
 * the result is marked `limited`. Only real technical/API problems throw
 * `AiGatewayError`; if the model gives nothing usable we fall back to the
 * campaign's fallback text and mark the row `fallback`.
 */
export async function generatePersonalization(
  config: AiPersonalizationConfig,
  lead: LeadRecord,
  credentials: WorkspaceAiCredentials,
): Promise<GenerationResult> {
  const facts = leadFacts(lead, config.fields, config.level);
  const safeFallback = () => ({
    content: (config.fallbackText || "I came across your team and wanted to reach out.").trim(),
    model: credentials.model,
    quality: "fallback" as const,
    dataUsed: [],
    painPoints: [],
  });

  // Nothing verified to work from — return the neutral line instead of failing.
  if (facts.length === 0) return safeFallback();

  const { system, prompt } = buildPrompt(config, facts);
  assertModelSelected(credentials);
  let text: string;
  try {
    if (credentials.provider === "anthropic") {
      if (!credentials.apiKey)
        throw new AiGatewayError({
          status: 401,
          message: "No Anthropic API key is connected for this workspace.",
          retryable: false,
        });
      text = await generateWithAnthropic({
        apiKey: credentials.apiKey,
        model: credentials.model,
        system,
        prompt,
      });
    } else {
      text = await generateWithOpenAi(credentials, { system, prompt, temperature: 0.6 });
    }
  } catch (error) {
    throw mapGatewayError(error, vendorOf(credentials), credentials.model);
  }

  const structured = parseStructured(text);
  const raw = structured?.personalization ?? text;
  const cleaned = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Model refused, went empty, or leaked a placeholder — degrade, don't fail.
  const leakedPlaceholder = /\{\{|\[\[|\{[a-z_]+\}/i.test(cleaned);
  if (!cleaned || /^INSUFFICIENT_DATA$/i.test(cleaned) || leakedPlaceholder) return safeFallback();

  const dataUsed = structured?.dataUsed?.length
    ? structured.dataUsed
    : facts.map((f) => f.label);
  // Low confidence, or very little material, is "limited" — still sendable.
  const quality: PersonalizationQuality =
    structured?.confidence === "low" || facts.length <= 1 ? "limited" : "complete";

  const painPoints = (structured?.painPoints ?? []).slice(0, config.painPointsPerLead);
  return { content: cleaned.slice(0, 600), model: credentials.model, quality, dataUsed, painPoints };
}


/** Stable fingerprint of the settings a stored snippet was generated with. */
/**
 * Values the sending pipeline substitutes for `{{ai_personalization}}`.
 *
 * `hold` means the lead must not be sent yet — the campaign owner chose to wait
 * for successful personalization rather than send a weaker email.
 */
/** Completed snippets for a set of leads on one campaign, keyed by lead id. */
// ---------------------------------------------------------------------------
// Background worker
// ---------------------------------------------------------------------------

type RunnerState = {
  locked_until: string | null;
  paused_reason: string | null;
  last_run_at: string | null;
};

export type WorkerResult = {
  claimed: number;
  completed: number;
  failed: number;
  skipped: string | null;
  paused: string | null;
  probe: boolean;
};

/** Pause the queue (credit/policy denials) so the scheduler stops burning calls. */
async function pauseRunner(admin: Client, reason: string) {
  await admin
    .from("ai_runner_state")
    .update({ paused_reason: reason, paused_at: new Date().toISOString() })
    .eq("key", RUNNER_KEY);
}

async function clearPause(admin: Client) {
  await admin
    .from("ai_runner_state")
    .update({ paused_reason: null, paused_at: null })
    .eq("key", RUNNER_KEY);
}

/**
 * Process one bounded batch of queued personalizations.
 *
 * Single-flight (lease row), bounded (`BATCH_SIZE`), idempotent (each row is
 * marked completed/failed as it is processed) and circuit-broken: a 402/403
 * parks the queue until one later probe succeeds.
 */
export async function processAiPersonalizationBatch(worker: string): Promise<WorkerResult> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const now = new Date();

  const { data: stateRow } = await admin
    .from("ai_runner_state")
    .select("locked_until, paused_reason, last_run_at")
    .eq("key", RUNNER_KEY)
    .maybeSingle();
  const state = (stateRow ?? null) as RunnerState | null;

  if (state?.locked_until && new Date(state.locked_until).getTime() > now.getTime()) {
    return {
      claimed: 0,
      completed: 0,
      failed: 0,
      skipped: "another run is in progress",
      paused: null,
      probe: false,
    };
  }

  const lockedUntil = new Date(now.getTime() + 4 * 60_000).toISOString();
  const { error: lockError } = await admin
    .from("ai_runner_state")
    .update({ locked_by: worker, locked_until: lockedUntil, last_run_at: now.toISOString() })
    .eq("key", RUNNER_KEY)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`);
  if (lockError) {
    return {
      claimed: 0,
      completed: 0,
      failed: 0,
      skipped: lockError.message,
      paused: null,
      probe: false,
    };
  }

  const paused = state?.paused_reason ?? null;
  // While paused, do at most one probe item per run to detect recovery.
  const limit = paused ? 1 : BATCH_SIZE;

  const result: WorkerResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    skipped: null,
    paused,
    probe: Boolean(paused),
  };

  try {
    const { data: claimed, error: claimError } = await admin.rpc("claim_ai_personalization_jobs", {
      _worker: worker,
      _limit: limit,
    });
    if (claimError) throw new Error(claimError.message);
    const jobs = (claimed ?? []) as Array<{
      id: string;
      campaign_id: string;
      lead_id: string;
      attempts: number;
    }>;
    result.claimed = jobs.length;
    if (!jobs.length) return result;

    // Group by campaign so settings are read once per campaign.
    const campaignIds = [...new Set(jobs.map((j) => j.campaign_id))];
    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id, workspace_id, ai_enabled, ai_config")
      .in("id", campaignIds);
    const campaignRows = (campaigns ?? []) as Array<{
      id: string;
      workspace_id: string;
      ai_enabled: boolean;
      ai_config: unknown;
    }>;
    const configById = new Map(
      campaignRows.map(
        (c) =>
          [
            c.id,
            {
              enabled: c.ai_enabled,
              config: normalizeAiConfig(c.ai_config),
              workspaceId: c.workspace_id,
            },
          ] as const,
      ),
    );

    /**
     * Every workspace pays its AI provider with its own key, and each campaign
     * can point at a different connected provider — so keys are loaded once per
     * workspace + selected provider pair.
     */
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const credsByWorkspace = new Map<string, WorkspaceAiCredentials | null>();
    const credsKey = (workspaceId: string, provider: string | null, model: string | null) =>
      `${workspaceId}::${provider ?? "default"}::${model ?? ""}`;
    for (const campaign of campaignRows) {
      const { provider, model } = normalizeAiConfig(campaign.ai_config);
      const key = credsKey(campaign.workspace_id, provider, model);
      if (credsByWorkspace.has(key)) continue;
      credsByWorkspace.set(
        key,
        await workspaceAiCredentials(admin, campaign.workspace_id, provider, model),
      );
    }
    /**
     * Workspaces that cannot generate right now (no key, plan allowance spent,
     * OpenAI key/credit/rate problem). This is NOT the lead's fault, so their
     * remaining jobs stay QUEUED with the reason attached — marking them failed
     * would burn thousands of leads for a condition that clears by itself.
     */
    const blockedWorkspaces = new Map<string, string>();

    const requeue = async (jobId: string, reason: string) => {
      await admin
        .from("ai_personalizations")
        .update({
          status: "queued",
          error: reason,
          // Claims consume an attempt before generation starts. Workspace-level
          // holds are not lead failures, so they must not exhaust the claim RPC's
          // attempts < 4 guard while a key, plan or rate-limit issue is unresolved.
          attempts: 0,
          locked_by: null,
          locked_until: null,
          completed_at: null,
        })
        .eq("id", jobId);
    };

    const { data: leads } = await admin
      .from("leads")
      .select(LEAD_AI_COLUMNS)
      .in("id", [...new Set(jobs.map((j) => j.lead_id))]);
    const withNotes = await attachLeadNotes(admin, (leads ?? []) as LeadRecord[]);
    const leadById = new Map(withNotes.map((l) => [l.id, l] as const));

    await mapWithConcurrency(jobs, CONCURRENCY, async (job) => {
      const settings = configById.get(job.campaign_id);
      const lead = leadById.get(job.lead_id);
      if (!settings || !lead) {
        await admin
          .from("ai_personalizations")
          .update({
            status: "failed",
            error: "Campaign or lead is no longer available.",
            locked_by: null,
            locked_until: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        result.failed += 1;
        return;
      }

      const blocked = blockedWorkspaces.get(settings.workspaceId);
      if (blocked) {
        await requeue(job.id, blocked);
        return;
      }

      const credentials =
        credsByWorkspace.get(credsKey(settings.workspaceId, settings.config.provider, settings.config.model)) ?? null;
      if (!credentials) {
        const reason = "No AI provider key is connected for this workspace.";
        blockedWorkspaces.set(settings.workspaceId, reason);
        result.skipped = reason;
        await requeue(job.id, reason);
        return;
      }

      // Plan enforcement: feature access + atomic monthly AI allowance.
      const { requireEntitlement, evaluateEntitlement, consumeUsage, EntitlementError } =
        await import("@/lib/billing/usage.server");
      try {
        await requireEntitlement(settings.workspaceId, "ai_personalization");
        // Allowance is only CHECKED here. It is charged after a real
        // generation, so validation failures and fallbacks stay free.
        const decision = await evaluateEntitlement(settings.workspaceId, "ai_monthly", 1);
        if (!decision.allowed) {
          throw new EntitlementError({
            code: "limit_reached",
            planName: decision.planName,
            resource: "ai_monthly",
            used: decision.used,
            limit: decision.limit,
            message: `You've reached your AI personalization allowance for the ${decision.planName} plan (${decision.used.toLocaleString()} of ${(decision.limit ?? 0).toLocaleString()}). Upgrade your plan to keep generating.`,
          });
        }
      } catch (error) {
        if (error instanceof EntitlementError) {
          // Plan limits clear on upgrade or at the next billing period — hold
          // the leads instead of destroying them.
          blockedWorkspaces.set(settings.workspaceId, error.message);
          result.skipped = error.message;
          await requeue(job.id, error.message);
          return;
        }
        throw error;
      }

      try {
        const { content, model, quality, dataUsed, painPoints } = await generatePersonalization(
          settings.config,
          lead,
          credentials,
        );
        // Only a real model generation costs allowance; fallback copy is free.
        if (quality !== "fallback") {
          await consumeUsage(settings.workspaceId, "ai_monthly", 1, "ai_personalization");
        }
        await admin
          .from("ai_personalizations")
          .update({
            status: "completed",
            content,
            model,
            quality,
            data_used: dataUsed,
            pain_points: painPoints,
            error: null,
            locked_by: null,
            locked_until: null,
            prompt_hash: promptFingerprint(settings.config),
            instructions: settings.config.instructions,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        result.completed += 1;
        if (paused) {
          await clearPause(admin);
          result.paused = null;
        }
      } catch (error) {
        // Nothing was charged unless a generation actually completed.
        const failure =
          error instanceof AiGatewayError
            ? error
            : mapGatewayError(error, vendorOf(credentials), credentials.model);

        // Key, credit and rate-limit problems belong to the workspace, not the
        // lead: park the workspace and keep every one of its leads queued.
        // A missing/unavailable model (404/409) is a settings problem too: the
        // leads wait until the customer refreshes models and picks another.
        const workspaceLevel = [401, 402, 403, 404, 409, 429].includes(failure.status);
        if (workspaceLevel) {
          blockedWorkspaces.set(settings.workspaceId, failure.message);
          result.skipped = failure.message;
          await requeue(job.id, failure.message);
          return;
        }

        const terminal = !failure.retryable || job.attempts >= 3;
        await admin
          .from("ai_personalizations")
          .update({
            status: terminal ? "failed" : "queued",
            error: failure.message,
            locked_by: null,
            locked_until: null,
            completed_at: terminal ? new Date().toISOString() : null,
          })
          .eq("id", job.id);
        if (terminal) result.failed += 1;
      }
    });


    return result;
  } finally {
    await admin
      .from("ai_runner_state")
      .update({ locked_by: null, locked_until: null })
      .eq("key", RUNNER_KEY);
  }
}

/**
 * Leads whose personalization is still being generated for this campaign.
 *
 * Messages are materialised at queue time, so a lead queued BEFORE its snippet
 * exists used to have the AI line baked out of the email permanently. Callers
 * hold these leads back until generation settles.
 */
/**
 * Send-time safety net: resolve any `{{ai_personalization}}` still sitting in a
 * stored message, so a snippet that arrived after queueing is used instead of
 * being sent literally.
 */
export async function resolveAiTokenAtSend(
  supabase: Client,
  campaignId: string,
  leadId: string | null,
  text: string,
  config: AiPersonalizationConfig,
): Promise<{ text: string; hold: boolean }> {
  const token = new RegExp(`\\{\\{\\s*${AI_TOKEN}\\s*(\\|[^}]*)?\\}\\}`, "g");
  const painToken = /\{\{\s*pain_point(?:_([1-5]))?\s*(?:\|[^}]*)?\}\}/gi;
  const usesAi = token.test(text);
  const usesPain = painToken.test(text);
  token.lastIndex = 0;
  painToken.lastIndex = 0;
  if (!usesAi && !usesPain) return { text, hold: false };
  const stored = leadId
    ? (await personalizationByLead(supabase, campaignId, [leadId])).get(leadId) ?? null
    : null;
  const { extras, hold } = aiExtras(config, stored);
  if (hold) return { text, hold: true };
  let out = usesAi ? text.replace(token, extras[AI_TOKEN] ?? "") : text;
  if (usesPain) {
    out = out.replace(painToken, (_match, slot: string | undefined) => {
      const key = painPointToken(slot ? Number(slot) : 1);
      return extras[key] ?? config.painPointFallback ?? "";
    });
  }
  return { text: out, hold: false };
}
