import {
  AI_TOKEN,
  normalizeAiConfig,
  type AiPersonalizationConfig,
  type AiPersonalizationCoverage,
  type FallbackMode,
} from "@/lib/ai-personalization-model";
import { fetchAllRows, fetchByIds } from "@/lib/supabase-batch";

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
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function aiExtras(
  config: AiPersonalizationConfig,
  content: string | null,
): { extras: Record<string, string>; hold: boolean } {
  if (content?.trim()) return { extras: { [AI_TOKEN]: content.trim() }, hold: false };
  const mode: FallbackMode = config.fallbackMode;
  if (mode === "hold") return { extras: {}, hold: true };
  if (mode === "skip") return { extras: { [AI_TOKEN]: "" }, hold: false };
  return { extras: { [AI_TOKEN]: config.fallbackText.trim() }, hold: false };
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
  const recipients = await fetchAllRows<{ lead_id: string }>(() =>
    supabase.from("campaign_recipients").select("lead_id").eq("campaign_id", campaignId)
      .eq("workspace_id", workspaceId).order("id", { ascending: true }),
  );
  const leadIds = [...new Set(recipients.map((row) => row.lead_id).filter(Boolean))];
  if (!leadIds.length) return { campaignId, workspaceId, total: 0, personalized: 0, missing: 0,
    queued: 0, failed: 0, complete: 0, limited: 0, fallback: 0, promptHashes: [],
    sampleLeadId: null, sampleLead: null, blockedReason: null };

  const rows = await fetchByIds<{ lead_id: string; status: string | null; content: string | null;
    quality: string | null; prompt_hash: string | null; error: string | null }>(leadIds, (ids) =>
    supabase.from("ai_personalizations").select("lead_id, status, content, quality, prompt_hash, error")
      .eq("campaign_id", campaignId).eq("workspace_id", workspaceId).in("lead_id", ids),
  );
  const valid = new Set<string>();
  const queued = new Set<string>();
  const failed = new Set<string>();
  const hashes = new Set<string>();
  const reasons = new Map<string, number>();
  let complete = 0, limited = 0, fallback = 0;
  for (const row of rows) {
    if (row.prompt_hash) hashes.add(row.prompt_hash);
    if (row.status === "completed" && row.content?.trim()) {
      if (!valid.has(row.lead_id)) {
        if (row.quality === "limited") limited += 1;
        else if (row.quality === "fallback") fallback += 1;
        else complete += 1;
      }
      valid.add(row.lead_id);
    } else if (row.status === "queued" || row.status === "processing") queued.add(row.lead_id);
    else if (row.status === "failed") failed.add(row.lead_id);
    if (row.error?.trim() && row.status !== "completed")
      reasons.set(row.error.trim(), (reasons.get(row.error.trim()) ?? 0) + 1);
  }
  const sampleLeadId = leadIds.find((id) => valid.has(id)) ?? null;
  let sampleLead: AiPersonalizationCoverage["sampleLead"] = null;
  if (sampleLeadId) {
    const { data: lead } = await supabase.from("leads")
      .select("id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields")
      .eq("id", sampleLeadId).eq("workspace_id", workspaceId).maybeSingle();
    if (lead) sampleLead = { ...lead, custom_fields:
      lead.custom_fields && typeof lead.custom_fields === "object" && !Array.isArray(lead.custom_fields)
        ? lead.custom_fields as Record<string, string> : null } as AiPersonalizationCoverage["sampleLead"];
  }
  return { campaignId, workspaceId, total: leadIds.length, personalized: valid.size,
    missing: Math.max(0, leadIds.length - valid.size), queued: queued.size, failed: failed.size,
    complete, limited, fallback, promptHashes: [...hashes], sampleLeadId, sampleLead,
    blockedReason: [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null };
}