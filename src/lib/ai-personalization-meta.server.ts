import {
  AI_TOKEN,
  PAIN_POINT_MAX,
  painPointToken,
  normalizeAiConfig,
  type AiPersonalizationConfig,
  type AiPersonalizationCoverage,
  type FallbackMode,
} from "@/lib/ai-personalization-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const LEAD_AI_COLUMNS =
  "id, email, first_name, last_name, job_title, company, website, city, state, country, custom_fields";

export function promptFingerprint(config: AiPersonalizationConfig): string {
  const payload = JSON.stringify({
    l: config.level,
    fw: config.framework,
    t: config.tone,
    n: config.length,
    g: config.language,
    i: config.instructions.trim(),
    f: [...config.fields].sort(),
    e: config.exampleOutput.trim(),
    pp: config.painPointsPerLead,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** What one lead's stored AI output looks like: the opener plus its own pain points. */
export type PersonalizationDetail = { content: string | null; painPoints: string[] };

/**
 * Pain point tokens for ONE lead. Each slot uses that lead's own generated pain
 * point; a lead without one falls back to the campaign's fallback line (or the
 * token is removed when there is none), so no email ever ships `{{pain_point}}`.
 */
function painPointExtras(
  config: AiPersonalizationConfig,
  painPoints: string[],
): Record<string, string> {
  const extras: Record<string, string> = {};
  const slots = Math.max(config.painPointsPerLead, painPoints.length);
  for (let i = 0; i < Math.min(PAIN_POINT_MAX, slots); i += 1) {
    extras[painPointToken(i + 1)] = (painPoints[i] ?? config.painPointFallback ?? "").trim();
  }
  return extras;
}

export function aiExtras(
  config: AiPersonalizationConfig,
  stored: string | PersonalizationDetail | null,
): { extras: Record<string, string>; hold: boolean } {
  const detail: PersonalizationDetail =
    typeof stored === "string" || stored === null || stored === undefined
      ? { content: (stored as string | null) ?? null, painPoints: [] }
      : stored;
  const pain = painPointExtras(config, detail.painPoints);
  if (detail.content?.trim())
    return { extras: { [AI_TOKEN]: detail.content.trim(), ...pain }, hold: false };
  const mode: FallbackMode = config.fallbackMode;
  if (mode === "hold") return { extras: {}, hold: true };
  if (mode === "skip") return { extras: { [AI_TOKEN]: "", ...pain }, hold: false };
  return { extras: { [AI_TOKEN]: config.fallbackText.trim(), ...pain }, hold: false };
}

export async function campaignAiSettings(
  supabase: Client,
  campaignId: string,
): Promise<{ enabled: boolean; config: AiPersonalizationConfig }> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("ai_enabled, ai_config")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { enabled: Boolean(data?.ai_enabled), config: normalizeAiConfig(data?.ai_config) };
}

export async function personalizationByLead(
  supabase: Client,
  campaignId: string,
  leadIds: string[],
): Promise<Map<string, PersonalizationDetail>> {
  const out = new Map<string, PersonalizationDetail>();
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
      .select("lead_id, content, status, pain_points")
      .eq("campaign_id", campaignId)
      .eq("workspace_id", campaign.workspace_id)
      .eq("status", "completed")
      .in("lead_id", leadIds.slice(i, i + 300));
    for (const row of (data ?? []) as Array<{
      lead_id: string;
      content: string | null;
      pain_points: unknown;
    }>) {
      const painPoints = Array.isArray(row.pain_points)
        ? (row.pain_points as unknown[]).filter((v): v is string => typeof v === "string")
        : [];
      if (row.content?.trim() || painPoints.length)
        out.set(row.lead_id, { content: row.content?.trim() ?? null, painPoints });
    }
  }
  return out;
}

export async function pendingPersonalizationLeads(
  supabase: Client,
  campaignId: string,
  leadIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data } = await supabase
      .from("ai_personalizations")
      .select("lead_id")
      .eq("campaign_id", campaignId)
      .in("status", ["queued", "processing"])
      .in("lead_id", leadIds.slice(i, i + 150));
    for (const row of (data ?? []) as Array<{ lead_id: string }>) out.add(row.lead_id);
  }
  return out;
}

export async function campaignAiCoverage(
  supabase: Client,
  campaignId: string,
): Promise<AiPersonalizationCoverage> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign?.workspace_id) throw new Error("Campaign not found.");
  const workspaceId = campaign.workspace_id as string;
  const { count: total, error: totalError } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", workspaceId);
  if (totalError) throw new Error(totalError.message);
  const audienceTotal = total ?? 0;
  if (!audienceTotal) return { campaignId, workspaceId, total: 0, personalized: 0, missing: 0,
    queued: 0, failed: 0, complete: 0, limited: 0, fallback: 0, promptHashes: [],
    sampleLeadId: null, sampleLead: null, blockedReason: null };

  const countRows = async (apply: (query: any) => any) => {
    const base = supabase.from("ai_personalizations").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId).eq("workspace_id", workspaceId);
    const result = await apply(base);
    if (result.error) throw new Error(result.error.message);
    return result.count ?? 0;
  };
  const [personalized, queued, failed, limited, fallback, sampleResult, blockedResult, hashResult] =
    await Promise.all([
      countRows((q) => q.eq("status", "completed").not("content", "is", null)),
      countRows((q) => q.in("status", ["queued", "processing"])),
      countRows((q) => q.eq("status", "failed")),
      countRows((q) => q.eq("status", "completed").eq("quality", "limited").not("content", "is", null)),
      countRows((q) => q.eq("status", "completed").eq("quality", "fallback").not("content", "is", null)),
      supabase.from("ai_personalizations").select("lead_id").eq("campaign_id", campaignId)
        .eq("workspace_id", workspaceId).eq("status", "completed").not("content", "is", null).limit(1).maybeSingle(),
      supabase.from("ai_personalizations").select("error").eq("campaign_id", campaignId)
        .eq("workspace_id", workspaceId).neq("status", "completed").not("error", "is", null).limit(1).maybeSingle(),
      supabase.from("ai_personalizations").select("prompt_hash").eq("campaign_id", campaignId)
        .eq("workspace_id", workspaceId).not("prompt_hash", "is", null).limit(100),
    ]);
  const sampleLeadId = (sampleResult.data?.lead_id as string | undefined) ?? null;
  let sampleLead: AiPersonalizationCoverage["sampleLead"] = null;
  if (sampleLeadId) {
    const { data: lead } = await supabase.from("leads")
      .select("id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields")
      .eq("id", sampleLeadId).eq("workspace_id", workspaceId).maybeSingle();
    if (lead) sampleLead = { ...lead, custom_fields:
      lead.custom_fields && typeof lead.custom_fields === "object" && !Array.isArray(lead.custom_fields)
        ? lead.custom_fields as Record<string, string> : null } as AiPersonalizationCoverage["sampleLead"];
  }
  return { campaignId, workspaceId, total: audienceTotal, personalized,
    missing: Math.max(0, audienceTotal - personalized), queued, failed,
    complete: Math.max(0, personalized - limited - fallback), limited, fallback,
    promptHashes: [...new Set<string>((hashResult.data ?? []).map(
      (row: { prompt_hash: string }) => row.prompt_hash,
    ))],
    sampleLeadId, sampleLead, blockedReason: blockedResult.data?.error?.trim() || null };
}