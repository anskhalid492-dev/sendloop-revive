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
import {
  AI_TOKEN,
  normalizeAiConfig,
  type AiPersonalizationConfig,
  type FallbackMode,
  type PersonalizationField,
} from "@/lib/ai-personalization-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const RUNNER_KEY = "ai_personalization";
/** Hard ceiling per worker run so a big list never becomes a request storm. */
const BATCH_SIZE = 10;

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
      message: "No OpenAI API key is connected for this workspace.",
      retryable: false,
    });
  return createOpenAICompatible({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
  });
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

export const LEAD_AI_COLUMNS =
  "id, email, first_name, last_name, job_title, company, website, city, state, country, custom_fields";

/**
 * Attach the most recent lead notes so "Lead notes" personalization has real
 * material. Notes live in their own table and are workspace-scoped by RLS.
 */
export async function attachLeadNotes(supabase: Client, leads: LeadRecord[]): Promise<LeadRecord[]> {
  if (!leads.length) return leads;
  const { data } = await supabase
    .from("lead_notes")
    .select("lead_id, body, created_at")
    .in("lead_id", leads.map((l) => l.id))
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
  const candidates: Array<{ field: PersonalizationField; label: string; value: string | null | undefined }> = [
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
    .filter((c) => fields.includes(c.field) && c.value && String(c.value).trim())
    .map((c) => ({ label: c.label, value: String(c.value).trim().slice(0, 400) }));

  if (fields.includes("custom_fields")) {
    for (const [key, value] of Object.entries(custom)) {
      if (["industry", "company_description", "description", "notes"].includes(key)) continue;
      if (!value || !String(value).trim()) continue;
      out.push({ label: key.replace(/_/g, " "), value: String(value).trim().slice(0, 200) });
    }
  }

  return out.slice(0, LEVEL_FIELD_LIMIT[level]);
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
    "- Never invent or imply company news, funding, achievements, awards, metrics, events, products or mutual connections.",
    "- Never guess industry, size, location or anything not listed.",
    "- No greeting, no sign-off, no subject line, no quotes, no markdown, no placeholders or brackets.",
    "- Do not mention that you are an AI or that data was provided.",
    `- Write in ${config.language}.`,
    `- Tone: ${config.tone}.`,
    `- ${LENGTH_RULE[config.length]}`,
    "- If the facts are too thin to say anything specific and truthful, reply with exactly: INSUFFICIENT_DATA",
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
    "Return only the personalization text.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}

function mapGatewayError(error: unknown): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const raw = error as { statusCode?: number; status?: number; message?: string };
  const status = raw?.statusCode ?? raw?.status ?? 0;
  const message = raw?.message ?? "AI generation failed.";
  if (status === 402 || status === 429)
    return new AiGatewayError({
      status,
      message:
        status === 402
          ? "Your OpenAI account has no available credit. Add billing in OpenAI and retry."
          : "OpenAI rate limited this workspace. Remaining leads stay queued and retry automatically.",
      retryable: status === 429,
    });
  if (status === 403)
    return new AiGatewayError({ status, message: "OpenAI blocked this request for your key.", retryable: false });
  if (status === 401)
    return new AiGatewayError({
      status,
      message: "Your OpenAI API key was rejected. Reconnect it in the AI tab.",
      retryable: false,
    });
  if (status === 400)
    return new AiGatewayError({ status, message: `OpenAI rejected the request: ${message}`, retryable: false });
  return new AiGatewayError({ status: status || 500, message, retryable: true });
}

/** One generation call with the workspace's own key. Throws `AiGatewayError`. */
export async function generatePersonalization(
  config: AiPersonalizationConfig,
  lead: LeadRecord,
  credentials: WorkspaceAiCredentials,
): Promise<{ content: string; model: string }> {
  const facts = leadFacts(lead, config.fields, config.level);
  if (facts.length === 0) {
    throw new AiGatewayError({
      status: 422,
      message: "This lead has none of the selected personalization fields filled in.",
      retryable: false,
    });
  }

  const { system, prompt } = buildPrompt(config, facts);
  let text: string;
  try {
    const result = await generateText({
      model: provider(credentials)(credentials.model),
      system,
      prompt,
      temperature: 0.6,
    });
    text = (result.text ?? "").trim();
  } catch (error) {
    throw mapGatewayError(error);
  }


  const cleaned = text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /^INSUFFICIENT_DATA$/i.test(cleaned)) {
    throw new AiGatewayError({
      status: 422,
      message: "Not enough verified data about this lead to personalize safely.",
      retryable: false,
    });
  }
  if (/[[{<]{1}[^\]}>]*[\]}>]/.test(cleaned) && /\{\{|\[\[/.test(cleaned)) {
    throw new AiGatewayError({
      status: 422,
      message: "Generated text contained placeholders and was discarded.",
      retryable: false,
    });
  }

  return { content: cleaned.slice(0, 600), model: MODEL };
}

/** Stable fingerprint of the settings a stored snippet was generated with. */
export function promptFingerprint(config: AiPersonalizationConfig): string {
  const payload = JSON.stringify({
    l: config.level,
    t: config.tone,
    n: config.length,
    g: config.language,
    i: config.instructions.trim(),
    f: [...config.fields].sort(),
    e: config.exampleOutput.trim(),
  });
  let h1 = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    h1 ^= payload.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0");
}

/**
 * Values the sending pipeline substitutes for `{{ai_personalization}}`.
 *
 * `hold` means the lead must not be sent yet — the campaign owner chose to wait
 * for successful personalization rather than send a weaker email.
 */
export function aiExtras(
  config: AiPersonalizationConfig,
  content: string | null,
): { extras: Record<string, string>; hold: boolean } {
  if (content && content.trim()) return { extras: { [AI_TOKEN]: content.trim() }, hold: false };
  const mode: FallbackMode = config.fallbackMode;
  if (mode === "hold") return { extras: {}, hold: true };
  if (mode === "skip") return { extras: { [AI_TOKEN]: "" }, hold: false };
  return { extras: { [AI_TOKEN]: config.fallbackText.trim() }, hold: false };
}

/** Completed snippets for a set of leads on one campaign, keyed by lead id. */
export async function personalizationByLead(
  supabase: Client,
  campaignId: string,
  leadIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!leadIds.length) return out;
  for (let i = 0; i < leadIds.length; i += 300) {
    const { data } = await supabase
      .from("ai_personalizations")
      .select("lead_id, content, status")
      .eq("campaign_id", campaignId)
      .eq("status", "completed")
      .in("lead_id", leadIds.slice(i, i + 300));
    for (const row of (data ?? []) as Array<{ lead_id: string; content: string | null }>) {
      if (row.content?.trim()) out.set(row.lead_id, row.content.trim());
    }
  }
  return out;
}

/** Read the AI settings of a campaign with the caller's client. */
export async function campaignAiSettings(
  supabase: Client,
  campaignId: string,
): Promise<{ enabled: boolean; config: AiPersonalizationConfig }> {
  const { data } = await supabase
    .from("campaigns")
    .select("ai_enabled, ai_config")
    .eq("id", campaignId)
    .maybeSingle();
  return {
    enabled: Boolean(data?.ai_enabled),
    config: normalizeAiConfig(data?.ai_config),
  };
}

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
    return { claimed: 0, completed: 0, failed: 0, skipped: "another run is in progress", paused: null, probe: false };
  }

  const lockedUntil = new Date(now.getTime() + 4 * 60_000).toISOString();
  const { error: lockError } = await admin
    .from("ai_runner_state")
    .update({ locked_by: worker, locked_until: lockedUntil, last_run_at: now.toISOString() })
    .eq("key", RUNNER_KEY)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`);
  if (lockError) {
    return { claimed: 0, completed: 0, failed: 0, skipped: lockError.message, paused: null, probe: false };
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
      .select("id, ai_enabled, ai_config")
      .in("id", campaignIds);
    const configById = new Map(
      ((campaigns ?? []) as Array<{ id: string; ai_enabled: boolean; ai_config: unknown }>).map(
        (c) => [c.id, { enabled: c.ai_enabled, config: normalizeAiConfig(c.ai_config) }] as const,
      ),
    );

    const { data: leads } = await admin
      .from("leads")
      .select(LEAD_AI_COLUMNS)
      .in("id", [...new Set(jobs.map((j) => j.lead_id))]);
    const withNotes = await attachLeadNotes(admin, (leads ?? []) as LeadRecord[]);
    const leadById = new Map(withNotes.map((l) => [l.id, l] as const));

    for (const job of jobs) {
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
        continue;
      }

      try {
        const { content, model } = await generatePersonalization(settings.config, lead);
        await admin
          .from("ai_personalizations")
          .update({
            status: "completed",
            content,
            model,
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
        const failure = error instanceof AiGatewayError ? error : mapGatewayError(error);
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

        // Circuit breaker: stop the whole run on credit/policy denials.
        if (failure.status === 402 || failure.status === 403 || failure.status === 401) {
          await pauseRunner(admin, failure.message);
          result.paused = failure.message;
          break;
        }
        if (failure.status === 429) {
          result.skipped = "rate limited — remaining items stay queued";
          break;
        }
      }
    }

    return result;
  } finally {
    await admin
      .from("ai_runner_state")
      .update({ locked_by: null, locked_until: null })
      .eq("key", RUNNER_KEY);
  }
}
