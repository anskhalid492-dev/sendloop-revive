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
    return { personalization, confidence, dataUsed };
  } catch {
    return null;
  }
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
    return new AiGatewayError({
      status,
      message: "OpenAI blocked this request for your key.",
      retryable: false,
    });
  if (status === 401)
    return new AiGatewayError({
      status,
      message: "Your OpenAI API key was rejected. Reconnect it in the AI tab.",
      retryable: false,
    });
  if (status === 400)
    return new AiGatewayError({
      status,
      message: `OpenAI rejected the request: ${message}`,
      retryable: false,
    });
  return new AiGatewayError({ status: status || 500, message, retryable: true });
}

/** How much verified material the snippet was built from. */
export type PersonalizationQuality = "complete" | "limited" | "fallback";

export type GenerationResult = {
  content: string;
  model: string;
  quality: PersonalizationQuality;
  dataUsed: string[];
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
  });

  // Nothing verified to work from — return the neutral line instead of failing.
  if (facts.length === 0) return safeFallback();

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

  return { content: cleaned.slice(0, 600), model: credentials.model, quality, dataUsed };
}


/** Stable fingerprint of the settings a stored snippet was generated with. */
/**
 * Values the sending pipeline substitutes for `{{ai_personalization}}`.
 *
 * `hold` means the lead must not be sent yet — the campaign owner chose to wait
 * for successful personalization rather than send a weaker email.
 */
/** Completed snippets for a set of leads on one campaign, keyed by lead id. */
export async function personalizationByLead(
  supabase: Client,
  campaignId: string,
  leadIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!leadIds.length) return out;
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign?.workspace_id) return out;
  for (let i = 0; i < leadIds.length; i += 300) {
    const { data } = await supabase
      .from("ai_personalizations")
      .select("lead_id, content, status")
      .eq("campaign_id", campaignId)
      .eq("workspace_id", campaign.workspace_id)
      .eq("status", "completed")
      .in("lead_id", leadIds.slice(i, i + 300));
    for (const row of (data ?? []) as Array<{ lead_id: string; content: string | null }>) {
      if (row.content?.trim()) out.set(row.lead_id, row.content.trim());
    }
  }
  return out;
}

/** Exact coverage of stored AI snippets for the campaign's actual recipients. */
export async function campaignAiCoverage(
  supabase: Client,
  campaignId: string,
): Promise<AiPersonalizationCoverage> {
  const { fetchAllRows, fetchByIds } = await import("@/lib/supabase-batch");

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaign?.workspace_id) throw new Error("Campaign not found.");
  const workspaceId = campaign.workspace_id as string;

  const recipients = await fetchAllRows<{ lead_id: string }>(() =>
    supabase
      .from("campaign_recipients")
      .select("lead_id")
      .eq("campaign_id", campaignId)
      .eq("workspace_id", workspaceId)
      .order("id", { ascending: true }),
  );
  const leadIds = [...new Set(recipients.map((row) => row.lead_id).filter(Boolean))];

  if (!leadIds.length) {
    return {
      campaignId,
      workspaceId,
      total: 0,
      personalized: 0,
      missing: 0,
      queued: 0,
      failed: 0,
      complete: 0,
      limited: 0,
      fallback: 0,
      promptHashes: [] as string[],
      sampleLeadId: null as string | null,
      sampleLead: null,
      blockedReason: null as string | null,
    };
  }

  const rows = await fetchByIds<{
    lead_id: string;
    status: string | null;
    content: string | null;
    quality: string | null;
    prompt_hash: string | null;
    error: string | null;
  }>(leadIds, (ids) =>
    supabase
      .from("ai_personalizations")
      .select("lead_id, status, content, quality, prompt_hash, error")
      .eq("campaign_id", campaignId)
      .eq("workspace_id", workspaceId)
      .in("lead_id", ids),
  );

  const validLeadIds = new Set<string>();
  const queuedLeadIds = new Set<string>();
  const failedLeadIds = new Set<string>();
  const promptHashes = new Set<string>();
  let complete = 0;
  let limited = 0;
  let fallback = 0;
  /** Why generation is not progressing, counted so the UI shows the real cause. */
  const reasons = new Map<string, number>();

  for (const row of rows) {
    if (row.prompt_hash) promptHashes.add(row.prompt_hash);
    if (row.status === "completed" && row.content?.trim()) {
      if (!validLeadIds.has(row.lead_id)) {
        const quality = row.quality ?? "complete";
        if (quality === "limited") limited += 1;
        else if (quality === "fallback") fallback += 1;
        else complete += 1;
      }
      validLeadIds.add(row.lead_id);
    } else if (row.status === "queued" || row.status === "processing") {
      queuedLeadIds.add(row.lead_id);
      if (row.error?.trim()) reasons.set(row.error.trim(), (reasons.get(row.error.trim()) ?? 0) + 1);
    } else if (row.status === "failed") {
      failedLeadIds.add(row.lead_id);
      if (row.error?.trim()) reasons.set(row.error.trim(), (reasons.get(row.error.trim()) ?? 0) + 1);
    }
  }

  const blockedReason =
    [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const sampleLeadId = leadIds.find((leadId) => validLeadIds.has(leadId)) ?? null;
  let sampleLead: AiPersonalizationCoverage["sampleLead"] = null;
  if (sampleLeadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select(
        "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
      )
      .eq("id", sampleLeadId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    sampleLead = lead
      ? {
          id: String(lead.id),
          email: typeof lead.email === "string" ? lead.email : null,
          first_name: typeof lead.first_name === "string" ? lead.first_name : null,
          last_name: typeof lead.last_name === "string" ? lead.last_name : null,
          company: typeof lead.company === "string" ? lead.company : null,
          job_title: typeof lead.job_title === "string" ? lead.job_title : null,
          country: typeof lead.country === "string" ? lead.country : null,
          city: typeof lead.city === "string" ? lead.city : null,
          state: typeof lead.state === "string" ? lead.state : null,
          website: typeof lead.website === "string" ? lead.website : null,
          phone: typeof lead.phone === "string" ? lead.phone : null,
          linkedin_url: typeof lead.linkedin_url === "string" ? lead.linkedin_url : null,
          custom_fields:
            lead.custom_fields && typeof lead.custom_fields === "object" && !Array.isArray(lead.custom_fields)
              ? (lead.custom_fields as Record<string, string>)
              : null,
        }
      : null;
  }

  return {
    campaignId,
    workspaceId,
    total: leadIds.length,
    personalized: validLeadIds.size,
    missing: Math.max(0, leadIds.length - validLeadIds.size),
    queued: queuedLeadIds.size,
    failed: failedLeadIds.size,
    complete,
    limited,
    fallback,
    promptHashes: [...promptHashes],
    sampleLeadId,
    sampleLead,
    blockedReason,
  };
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

    // Every workspace pays OpenAI with its own key, so load them per workspace.
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const credsByWorkspace = new Map<string, WorkspaceAiCredentials | null>();
    for (const workspaceId of new Set(campaignRows.map((c) => c.workspace_id))) {
      credsByWorkspace.set(workspaceId, await workspaceAiCredentials(admin, workspaceId));
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

      const credentials = credsByWorkspace.get(settings.workspaceId) ?? null;
      if (!credentials) {
        const reason = "No OpenAI API key is connected for this workspace.";
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
        const { content, model, quality, dataUsed } = await generatePersonalization(
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
        const failure = error instanceof AiGatewayError ? error : mapGatewayError(error);

        // Key, credit and rate-limit problems belong to the workspace, not the
        // lead: park the workspace and keep every one of its leads queued.
        const workspaceLevel = [401, 402, 403, 429].includes(failure.status);
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
export async function pendingPersonalizationLeads(
  supabase: Client,
  campaignId: string,
  leadIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!leadIds.length) return out;
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data } = await supabase
      .from("ai_personalizations")
      .select("lead_id, status")
      .eq("campaign_id", campaignId)
      .in("status", ["queued", "processing"])
      .in("lead_id", leadIds.slice(i, i + 150));
    for (const row of (data ?? []) as Array<{ lead_id: string }>) out.add(row.lead_id);
  }
  return out;
}

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
  if (!token.test(text)) return { text, hold: false };
  const content = leadId
    ? (await personalizationByLead(supabase, campaignId, [leadId])).get(leadId) ?? null
    : null;
  const { extras, hold } = aiExtras(config, content);
  if (hold) return { text, hold: true };
  return { text: text.replace(token, extras[AI_TOKEN] ?? ""), hold: false };
}
