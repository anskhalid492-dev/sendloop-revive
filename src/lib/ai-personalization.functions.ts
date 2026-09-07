import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { campaignInput, configSchema } from "@/lib/ai-personalization-schemas";
import {
  normalizeAiConfig,
  type AiPersonalizationConfig,
  type AiUsageStats,
  type PersonalizationRow,
  type PersonalizationStats,
} from "@/lib/ai-personalization-model";
import { chunk, ID_FILTER_CHUNK, ROW_PAGE_SIZE } from "@/lib/supabase-batch";

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

/**
 * Generate personalization for ONE lead, on demand.
 *
 * Used by the setup preview (not stored) and by the email preview / send path
 * (`save: true`, stored against workspace + campaign + lead so the exact same
 * text is what the lead receives).
 */
export const previewAiPersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({
        leadId: z.string().uuid(),
        config: configSchema.optional(),
        save: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      attachLeadNotes,
      campaignAiSettings,
      generatePersonalization,
      promptFingerprint,
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
      const { content, quality, dataUsed, model } = await generatePersonalization(
        config,
        withNotes!,
        credentials,
      );

      if (data.save) {
        const row = {
          workspace_id: campaign.workspace_id,
          campaign_id: data.campaignId,
          lead_id: data.leadId,
          status: "completed" as const,
          content,
          quality,
          data_used: dataUsed,
          model,
          error: null,
          attempts: 0,
          prompt_hash: promptFingerprint(config),
          instructions: config.instructions,
          completed_at: new Date().toISOString(),
        };
        const { data: existing } = await context.supabase
          .from("ai_personalizations")
          .select("id")
          .eq("campaign_id", data.campaignId)
          .eq("workspace_id", campaign.workspace_id)
          .eq("lead_id", data.leadId)
          .maybeSingle();
        if (existing?.id) {
          await context.supabase.from("ai_personalizations").update(row).eq("id", existing.id);
        } else {
          await context.supabase.from("ai_personalizations").insert(row);
        }
      }

      return { ok: true as const, content, quality, dataUsed, leadId: data.leadId };
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

/** Stored personalization for one lead on one campaign, for the email preview. */
export const getLeadPersonalization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.extend({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign?.workspace_id) throw new Error("Campaign not found.");

    const { data: recipient } = await context.supabase
      .from("campaign_recipients")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("workspace_id", campaign.workspace_id)
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (!recipient) return null;

    const { data: row } = await context.supabase
      .from("ai_personalizations")
      .select("id, status, quality, content, data_used, error")
      .eq("campaign_id", data.campaignId)
      .eq("workspace_id", campaign.workspace_id)
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (!row) return null;
    return {
      id: row.id as string,
      status: row.status as string,
      quality: (row.quality ?? "complete") as string,
      content: (row.content ?? null) as string | null,
      dataUsed: (row.data_used ?? []) as string[],
      error: (row.error ?? null) as string | null,
    };
  });

/**
 * Queue personalization for a campaign's recipients.
 *
 * The browser starts ONE job: this function only writes queue rows (in bounded
 * batches) and the background worker generates in small batches of its own, so
 * no request — ours or OpenAI's — ever carries 1,000 leads at once.
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
    const workspaceId = campaign.workspace_id as string;

    const { requireEntitlement } = await import("@/lib/billing/usage.server");
    await requireEntitlement(workspaceId, "ai_personalization");

    // Generation runs on the workspace's own key — fail early with a clear
    // message instead of queueing work that every item would fail on.
    const { workspaceAiKeyInfo } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keyInfo = await workspaceAiKeyInfo(supabaseAdmin, workspaceId);
    if (!keyInfo.connected) {
      throw new Error("Connect your OpenAI account before generating personalization.");
    }
    if (keyInfo.status !== "verified") {
      throw new Error("Your OpenAI connection needs attention. Please reconnect your API key.");
    }

    const { config } = await campaignAiSettings(context.supabase, data.campaignId);
    const fingerprint = promptFingerprint(config);

    // Only leads that are actually recipients of this campaign, in this
    // workspace. Paged, because a campaign can hold far more than 1,000 rows.
    const leadIdSet = new Set<string>();
    if (data.leadIds?.length) {
      for (const ids of chunk(data.leadIds, ID_FILTER_CHUNK)) {
        const { data: rows, error } = await context.supabase
          .from("campaign_recipients")
          .select("lead_id")
          .eq("campaign_id", data.campaignId)
          .eq("workspace_id", workspaceId)
          .in("lead_id", ids);
        if (error) throw new Error(error.message);
        for (const row of (rows ?? []) as Array<{ lead_id: string }>) leadIdSet.add(row.lead_id);
      }
    } else {
      for (let from = 0; ; from += ROW_PAGE_SIZE) {
        const { data: rows, error } = await context.supabase
          .from("campaign_recipients")
          .select("lead_id")
          .eq("campaign_id", data.campaignId)
          .eq("workspace_id", workspaceId)
          .order("lead_id", { ascending: true })
          .range(from, from + ROW_PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        const page = (rows ?? []) as Array<{ lead_id: string }>;
        for (const row of page) leadIdSet.add(row.lead_id);
        if (page.length < ROW_PAGE_SIZE) break;
      }
    }

    const leadIds = [...leadIdSet];
    if (!leadIds.length) return { queued: 0, reused: 0, total: 0 };

    const existingByLead = new Map<
      string,
      { id: string; lead_id: string; status: string; prompt_hash: string | null }
    >();
    for (const ids of chunk(leadIds, ID_FILTER_CHUNK)) {
      const { data: existing, error } = await context.supabase
        .from("ai_personalizations")
        .select("id, lead_id, status, prompt_hash")
        .eq("campaign_id", data.campaignId)
        .eq("workspace_id", workspaceId)
        .in("lead_id", ids);
      if (error) throw new Error(error.message);
      for (const row of (existing ?? []) as Array<{
        id: string;
        lead_id: string;
        status: string;
        prompt_hash: string | null;
      }>) {
        existingByLead.set(row.lead_id, row);
      }
    }

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
          workspace_id: workspaceId,
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

    for (const batch of chunk(toInsert, 400)) {
      const { error } = await context.supabase.from("ai_personalizations").insert(batch);
      if (error) throw new Error(error.message);
    }
    for (const ids of chunk(toRequeue, ID_FILTER_CHUNK)) {
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
        .in("id", ids);
      if (error) throw new Error(error.message);
    }

    return { queued: toInsert.length + toRequeue.length, reused, total: leadIds.length };
  });

/** Stop an in-flight run: drops queued work, keeps everything already generated. */
export const cancelAiPersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_personalizations")
      .delete()
      .eq("campaign_id", data.campaignId)
      .in("status", ["queued", "processing"])
      .select("id");
    if (error) throw new Error(error.message);
    return { cancelled: (rows ?? []).length };
  });


export const getAiPersonalizationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }): Promise<PersonalizationStats & { paused: string | null }> => {
    const { campaignAiCoverage } = await import("@/lib/ai-personalization.server");
    const [coverage, runnerRes] = await Promise.all([
      campaignAiCoverage(context.supabase, data.campaignId),
      context.supabase
        .from("ai_runner_state")
        .select("paused_reason")
        .eq("key", "ai_personalization")
        .maybeSingle(),
    ]);

    return {
      eligible: coverage.total,
      personalized: coverage.personalized,
      complete: coverage.complete,
      limited: coverage.limited,
      fallback: coverage.fallback,
      failed: coverage.failed,
      queued: coverage.queued,
      remaining: coverage.missing,
      blockedReason: coverage.blockedReason,
      paused: (runnerRes.data?.paused_reason as string | null) ?? null,
    };
  });

export const getAiPersonalizationCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const { campaignAiCoverage } = await import("@/lib/ai-personalization.server");
    return campaignAiCoverage(context.supabase, data.campaignId);
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

/**
 * Drain the queue immediately instead of waiting for the next cron tick.
 *
 * The UI calls this right after queueing so the operator sees snippets appear
 * in seconds. It is bounded (a fixed number of batches per call) and reuses the
 * same single-flight worker, so it can never race the scheduler.
 */
export const runAiPersonalizationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput.extend({ passes: z.number().int().min(1).max(8).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Membership check: RLS decides whether the caller may touch this campaign.
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select("id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found.");

    const { processAiPersonalizationBatch } = await import("@/lib/ai-personalization.server");
    let completed = 0;
    let failed = 0;
    let paused: string | null = null;
    for (let pass = 0; pass < (data.passes ?? 4); pass += 1) {
      const result = await processAiPersonalizationBatch(
        `ui-${Math.random().toString(36).slice(2, 10)}`,
      );
      completed += result.completed;
      failed += result.failed;
      paused = result.paused;
      if (result.claimed === 0 || result.paused) break;
    }
    return { completed, failed, paused };
  });
