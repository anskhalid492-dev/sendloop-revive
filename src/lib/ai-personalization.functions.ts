import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  normalizeAiConfig,
  type AiPersonalizationConfig,
  type AiUsageStats,
  type PersonalizationRow,
  type PersonalizationStats,
} from "@/lib/ai-personalization-model";

const configSchema = z.object({
  level: z.enum(["light", "balanced", "deep"]),
  tone: z.enum(["professional", "friendly", "direct", "conversational", "curious"]),
  length: z.enum(["one_line", "two_lines", "short_paragraph"]),
  language: z.string().min(2).max(40),
  instructions: z.string().max(4000),
  fields: z.array(z.string()).max(20),
  exampleOutput: z.string().max(2000),
  fallbackMode: z.enum(["fallback_text", "skip", "hold"]),
  fallbackText: z.string().max(600),
});

const campaignInput = z.object({ campaignId: z.string().uuid() });

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const { campaignAiSettings } = await import("@/lib/ai-personalization.server");
    return campaignAiSettings(context.supabase, data.campaignId);
  });

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput.extend({ enabled: z.boolean(), config: configSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const config = normalizeAiConfig(data.config);
    const { error } = await context.supabase
      .from("campaigns")
      .update({ ai_enabled: data.enabled, ai_config: config })
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { enabled: data.enabled, config };
  });

/** One-off preview generation. Never stored, so previews can't be sent by accident. */
export const previewAiPersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({ leadId: z.string().uuid(), config: configSchema.optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      attachLeadNotes,
      campaignAiSettings,
      generatePersonalization,
      AiGatewayError,
      LEAD_AI_COLUMNS,
    } = await import("@/lib/ai-personalization.server");

    const config: AiPersonalizationConfig = data.config
      ? normalizeAiConfig(data.config)
      : (await campaignAiSettings(context.supabase, data.campaignId)).config;

    // RLS scopes this read to the caller's workspace.
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select(LEAD_AI_COLUMNS)
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead not found.");

    const [withNotes] = await attachLeadNotes(context.supabase, [lead as never]);

    // The preview runs on the workspace's own OpenAI key, exactly like sending.
    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign?.workspace_id) throw new Error("Campaign not found.");

    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const credentials = await workspaceAiCredentials(supabaseAdmin, campaign.workspace_id);
    if (!credentials) {
      return {
        ok: false as const,
        leadId: data.leadId,
        message: "Connect your OpenAI API key to generate personalization.",
        status: 401,
      };
    }

    try {
      const { content } = await generatePersonalization(config, withNotes!, credentials);
      return { ok: true as const, content, leadId: data.leadId };
    } catch (error) {
      const failure = error instanceof AiGatewayError ? error : null;
      return {
        ok: false as const,
        leadId: data.leadId,
        message: failure?.message ?? "Personalization could not be generated.",
        status: failure?.status ?? 500,
      };
    }
  });

/**
 * Queue personalization for a campaign's recipients.
 *
 * Work is queued in the database and processed by the background worker in
 * bounded batches — never one request per lead from the browser.
 */
export const queueAiPersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({
        leadIds: z.array(z.string().uuid()).max(5000).optional(),
        regenerate: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { promptFingerprint, campaignAiSettings } =
      await import("@/lib/ai-personalization.server");

    const { data: campaign, error: cErr } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found.");

    const { config } = await campaignAiSettings(context.supabase, data.campaignId);
    const fingerprint = promptFingerprint(config);

    // Only leads that are actually recipients of this campaign, in this workspace.
    let recipientQuery = context.supabase
      .from("campaign_recipients")
      .select("lead_id")
      .eq("campaign_id", data.campaignId)
      .eq("workspace_id", campaign.workspace_id);
    if (data.leadIds?.length) recipientQuery = recipientQuery.in("lead_id", data.leadIds);
    const { data: recipients, error: rErr } = await recipientQuery;
    if (rErr) throw new Error(rErr.message);

    const leadIds = [
      ...new Set(((recipients ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id)),
    ];
    if (!leadIds.length) return { queued: 0, reused: 0, total: 0 };

    const { data: existing, error: eErr } = await context.supabase
      .from("ai_personalizations")
      .select("id, lead_id, status, prompt_hash")
      .eq("campaign_id", data.campaignId)
      .in("lead_id", leadIds);
    if (eErr) throw new Error(eErr.message);

    const existingByLead = new Map(
      (
        (existing ?? []) as Array<{
          id: string;
          lead_id: string;
          status: string;
          prompt_hash: string | null;
        }>
      ).map((row) => [row.lead_id, row] as const),
    );

    const toInsert: Array<{
      workspace_id: string;
      campaign_id: string;
      lead_id: string;
      status: "queued";
      prompt_hash: string;
      instructions: string;
    }> = [];
    const toRequeue: string[] = [];
    let reused = 0;

    for (const leadId of leadIds) {
      const row = existingByLead.get(leadId);
      if (!row) {
        toInsert.push({
          workspace_id: campaign.workspace_id,
          campaign_id: data.campaignId,
          lead_id: leadId,
          status: "queued" as const,
          prompt_hash: fingerprint,
          instructions: config.instructions,
        });
        continue;
      }
      const stale = row.prompt_hash !== fingerprint;
      // Reuse a completed snippet unless the settings changed or the user asked
      // for a regenerate — that keeps repeat launches from re-billing AI calls.
      if (row.status === "completed" && !stale && !data.regenerate) {
        reused += 1;
        continue;
      }
      if (row.status === "queued" || row.status === "processing") continue;
      toRequeue.push(row.id);
    }

    if (toInsert.length) {
      const { error } = await context.supabase.from("ai_personalizations").insert(toInsert);
      if (error) throw new Error(error.message);
    }
    if (toRequeue.length) {
      const { error } = await context.supabase
        .from("ai_personalizations")
        .update({
          status: "queued",
          content: null,
          error: null,
          attempts: 0,
          locked_by: null,
          locked_until: null,
          completed_at: null,
          prompt_hash: fingerprint,
          instructions: config.instructions,
        })
        .in("id", toRequeue);
      if (error) throw new Error(error.message);
    }

    return { queued: toInsert.length + toRequeue.length, reused, total: leadIds.length };
  });

export const getAiPersonalizationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }): Promise<PersonalizationStats & { paused: string | null }> => {
    const [recipientsRes, rowsRes, runnerRes] = await Promise.all([
      context.supabase
        .from("campaign_recipients")
        .select("lead_id")
        .eq("campaign_id", data.campaignId),
      context.supabase
        .from("ai_personalizations")
        .select("status")
        .eq("campaign_id", data.campaignId),
      context.supabase
        .from("ai_runner_state")
        .select("paused_reason")
        .eq("key", "ai_personalization")
        .maybeSingle(),
    ]);

    const eligible = new Set(
      ((recipientsRes.data ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id),
    ).size;
    const rows = (rowsRes.data ?? []) as Array<{ status: string }>;
    const personalized = rows.filter((r) => r.status === "completed").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const queued = rows.filter((r) => r.status === "queued" || r.status === "processing").length;

    return {
      eligible,
      personalized,
      failed,
      queued,
      remaining: Math.max(0, eligible - personalized),
      paused: (runnerRes.data?.paused_reason as string | null) ?? null,
    };
  });

export const listAiPersonalizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({
        status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("ai_personalizations")
      .select(
        "id, campaign_id, lead_id, status, content, attempts, error, edited, accepted, created_at, completed_at",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const personalizations = (rows ?? []) as unknown as PersonalizationRow[];
    const leadIds = [...new Set(personalizations.map((p) => p.lead_id))];
    const leadById = new Map<string, { email: string; name: string; company: string | null }>();
    if (leadIds.length) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, email, first_name, last_name, company")
        .in("id", leadIds);
      for (const lead of (leads ?? []) as Array<{
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        company: string | null;
      }>) {
        leadById.set(lead.id, {
          email: lead.email,
          name: [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || lead.email,
          company: lead.company,
        });
      }
    }

    return personalizations.map((row) => ({ ...row, lead: leadById.get(row.lead_id) ?? null }));
  });

/** Manual edit of a generated snippet — edits are preserved and never overwritten silently. */
export const updateAiPersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), content: z.string().min(1).max(1200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_personalizations")
      .update({
        content: data.content.trim(),
        status: "completed",
        edited: true,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retryFailedAiPersonalizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_personalizations")
      .update({
        status: "queued",
        error: null,
        attempts: 0,
        locked_by: null,
        locked_until: null,
        completed_at: null,
      })
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);
    return { requeued: (rows ?? []).length };
  });

/** Workspace-level AI usage, used for the cost/usage panel in the builder. */
export const getAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AiUsageStats> => {
    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);

    const [allRes, periodRes] = await Promise.all([
      context.supabase
        .from("ai_personalizations")
        .select("status", { count: "exact", head: false })
        .eq("workspace_id", data.workspaceId),
      context.supabase
        .from("ai_personalizations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("status", "completed")
        .gte("completed_at", periodStart.toISOString()),
    ]);

    const rows = (allRes.data ?? []) as Array<{ status: string }>;
    return {
      generated: rows.filter((r) => r.status === "completed").length,
      failed: rows.filter((r) => r.status === "failed").length,
      periodStart: periodStart.toISOString(),
      periodGenerated: periodRes.count ?? 0,
      limit: null,
    };
  });
