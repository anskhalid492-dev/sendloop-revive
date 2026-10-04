/**
 * AI Campaign Writer — authenticated server functions.
 *
 * Every call: verifies the signed-in caller (middleware), resolves the campaign
 * through the caller's own RLS client (so campaign + workspace ownership are
 * proven, never taken from the frontend), checks the plan entitlement and the AI
 * allowance, then generates with the workspace's own encrypted AI key server
 * side. API keys never leave the server. This feature never sends email.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  briefSchema,
  controlsSchema,
  normalizeWriterState,
  strategySchema,
  writerStateSchema,
  writerStepSchema,
  type WriterState,
} from "@/lib/ai-campaign-writer-model";

const campaignInput = z.object({ campaignId: z.string().uuid() });

type Failure = { ok: false; message: string; status: number };

const providerInput = z.enum(["openai", "anthropic"]).nullish();

const generationInput = campaignInput.extend({
  brief: briefSchema,
  controls: controlsSchema,
  /** Which connected AI provider to generate with; falls back to the campaign's saved choice. */
  provider: providerInput,
});

/**
 * Resolves the campaign's workspace through the caller's RLS client and returns
 * the workspace AI credentials, or a customer-facing failure.
 */
async function writerContext(
  supabase: { from: (t: string) => any },
  campaignId: string,
  preferredProvider?: string | null,
) {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, workspace_id, ai_config, custom_variables")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign?.workspace_id)
    return { failure: { ok: false as const, message: "Campaign not found.", status: 404 } };
  const workspaceId = campaign.workspace_id as string;

  const { requireEntitlement, EntitlementError } = await import("@/lib/billing/usage.server");
  try {
    // Plan access still applies; generations themselves are unlimited, so the
    // AI allowance is deliberately not checked or consumed here.
    await requireEntitlement(workspaceId, "ai_campaign_writer");
  } catch (err) {
    if (err instanceof EntitlementError)
      return { failure: { ok: false as const, message: err.message, status: 402 } };
    throw err;
  }

  const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const configProvider =
    typeof (campaign.ai_config as Record<string, unknown> | null)?.["provider"] === "string"
      ? ((campaign.ai_config as Record<string, unknown>)["provider"] as string)
      : null;
  const wanted = (preferredProvider || configProvider) ?? "";
  const configModel =
    typeof (campaign.ai_config as Record<string, unknown> | null)?.["model"] === "string"
      ? ((campaign.ai_config as Record<string, unknown>)["model"] as string)
      : null;
  const credentials = await workspaceAiCredentials(
    supabaseAdmin,
    workspaceId,
    wanted === "anthropic" ? "anthropic" : wanted === "openai" ? "openai" : undefined,
    // The campaign's model belongs to the campaign's provider only.
    wanted && wanted === configProvider ? configModel : null,
  );
  if (!credentials)
    return {
      failure: {
        ok: false as const,
        message: "Connect an AI provider key (OpenAI or Claude) in the AI settings to use the campaign writer.",
        status: 401,
      },
    };
  const customVariables = (Array.isArray(campaign.custom_variables) ? campaign.custom_variables : [])
    .filter((v: unknown): v is { token: string; label?: string; defaultValue?: string } =>
      Boolean(v && typeof (v as { token?: unknown }).token === "string" && (v as { token: string }).token))
    .map((v: { token: string; label?: string; defaultValue?: string }) => ({
      token: v.token,
      label: String(v.label ?? ""),
      defaultValue: String(v.defaultValue ?? ""),
    }));
  return { workspaceId, credentials, customVariables };
}

/** Wraps a generation so provider problems become readable, retryable messages. */
async function guard<T>(
  workspaceId: string,
  run: () => Promise<T>,
): Promise<({ ok: true } & T) | Failure> {
  const { AiGatewayError } = await import("@/lib/ai-personalization.server");
  try {
    const result = await run();
    // Campaign writer generations are unlimited on every plan that includes the
    // feature, so they are deliberately not metered against the AI allowance.
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof AiGatewayError)
      return { ok: false as const, message: error.message, status: error.status };
    return {
      ok: false as const,
      message: "The AI request failed. Please try again.",
      status: 500,
    };
  }
}

export const getCampaignWriterState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .select("ai_writer_brief")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const state = normalizeWriterState((row as { ai_writer_brief?: unknown } | null)?.ai_writer_brief);
    const { workspaceAiKeys } = await import("@/lib/ai-keys.server");
    let providers: Array<{ provider: string; model: string; status: string }> = [];
    try {
      const { data: campaign } = await context.supabase
        .from("campaigns")
        .select("workspace_id")
        .eq("id", data.campaignId)
        .maybeSingle();
      if (campaign?.workspace_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        providers = await workspaceAiKeys(supabaseAdmin, campaign.workspace_id);
      }
    } catch {
      providers = [];
    }
    return { state, providers };
  });

export const saveCampaignWriterState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.extend({ state: writerStateSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const state: WriterState = { ...data.state, updatedAt: new Date().toISOString() };
    const { error } = await context.supabase
      .from("campaigns")
      .update({ ai_writer_brief: state })
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true as const, state };
  });

export const generateCampaignStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    generationInput
      .extend({ angle: z.string().max(300).nullish(), refinement: z.string().max(300).nullish() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await writerContext(context.supabase as never, data.campaignId, data.provider ?? null);
    if ("failure" in ctx) return ctx.failure;
    const { generateStrategy } = await import("@/lib/ai-campaign-writer.server");
    return guard(ctx.workspaceId, async () => ({
      strategy: await generateStrategy({
        credentials: ctx.credentials,
        brief: data.brief,
        controls: data.controls,
        angle: data.angle ?? null,
        refinement: data.refinement ?? null,
      }),
      provider: ctx.credentials.provider,
      model: ctx.credentials.model,
    }));
  });

export const generateCampaignAngles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => generationInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await writerContext(context.supabase as never, data.campaignId, data.provider ?? null);
    if ("failure" in ctx) return ctx.failure;
    const { generateAngles } = await import("@/lib/ai-campaign-writer.server");
    return guard(ctx.workspaceId, async () => ({
      angles: await generateAngles({ credentials: ctx.credentials, brief: data.brief }),
      provider: ctx.credentials.provider,
      model: ctx.credentials.model,
    }));
  });

export const improveCampaignOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => generationInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await writerContext(context.supabase as never, data.campaignId, data.provider ?? null);
    if ("failure" in ctx) return ctx.failure;
    const { improveOffer } = await import("@/lib/ai-campaign-writer.server");
    return guard(ctx.workspaceId, async () => ({
      advice: await improveOffer({ credentials: ctx.credentials, brief: data.brief }),
      provider: ctx.credentials.provider,
      model: ctx.credentials.model,
    }));
  });

export const generateCampaignStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    generationInput
      .extend({
        strategy: strategySchema,
        index: z.number().int().min(0).max(9),
        total: z.number().int().min(1).max(10),
        purpose: z.string().max(300),
        previous: z.array(writerStepSchema).max(10).default([]),
        refinement: z.string().max(300).nullish(),
        avoid: z.string().max(6000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await writerContext(context.supabase as never, data.campaignId, data.provider ?? null);
    if ("failure" in ctx) return ctx.failure;
    const { generateStep } = await import("@/lib/ai-campaign-writer.server");
    return guard(ctx.workspaceId, async () => ({
      step: await generateStep({
        credentials: ctx.credentials,
        brief: data.brief,
        controls: data.controls,
        strategy: data.strategy,
        index: data.index,
        total: data.total,
        purpose: data.purpose,
        previous: data.previous,
        refinement: data.refinement ?? null,
        avoid: data.avoid ?? null,
        customVariables: ctx.customVariables,
      }),
      index: data.index,
      provider: ctx.credentials.provider,
      model: ctx.credentials.model,
    }));
  });

export const reviewCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({
        brief: briefSchema,
        strategy: strategySchema,
        steps: z.array(writerStepSchema).min(1).max(10),
        provider: providerInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await writerContext(context.supabase as never, data.campaignId, data.provider ?? null);
    if ("failure" in ctx) return ctx.failure;
    const { reviewCampaign } = await import("@/lib/ai-campaign-writer.server");
    return guard(ctx.workspaceId, async () => ({
      review: await reviewCampaign({
        credentials: ctx.credentials,
        brief: data.brief,
        strategy: data.strategy,
        steps: data.steps,
      }),
      provider: ctx.credentials.provider,
      model: ctx.credentials.model,
    }));
  });

// ---------------------------------------------------------------------------
// Moving generated copy into an existing campaign
// ---------------------------------------------------------------------------

/** Campaigns the generated sequence can be written into. */
export const listWriterTargetCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: source, error } = await context.supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source?.workspace_id) return { campaigns: [] as WriterTarget[] };
    const { data: rows, error: listError } = await context.supabase
      .from("campaigns")
      .select("id, name, status, updated_at")
      .eq("workspace_id", source.workspace_id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (listError) throw new Error(listError.message);
    const campaigns = ((rows ?? []) as Array<{ id: string; name: string; status: string }>).map(
      (row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        // Live campaigns already have queued or sent mail, so their copy is locked.
        editable: row.status === "draft" || row.status === "paused",
      }),
    );
    return { campaigns };
  });

export type WriterTarget = { id: string; name: string; status: string; editable: boolean };

const applyStepSchema = z.object({
  subject: z.string().max(300),
  body: z.string().max(20000),
  waitDays: z.number().int().min(0).max(90).default(3),
});

/**
 * Resolves a target campaign through the caller's own RLS client, proving both
 * campaigns belong to the same workspace before anything is written.
 */
async function targetContext(
  supabase: { from: (t: string) => any },
  sourceCampaignId: string,
  targetCampaignId: string,
) {
  const { data: source, error } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", sourceCampaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source?.workspace_id)
    return { failure: { ok: false as const, message: "Campaign not found.", status: 404 } };
  const { data: target, error: targetError } = await supabase
    .from("campaigns")
    .select("id, name, status, workspace_id, ai_config, ai_enabled")
    .eq("id", targetCampaignId)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target?.workspace_id || target.workspace_id !== source.workspace_id)
    return {
      failure: { ok: false as const, message: "That campaign could not be found.", status: 404 },
    };
  if (target.status !== "draft" && target.status !== "paused")
    return {
      failure: {
        ok: false as const,
        message: `${target.name} is ${target.status}. Pause it first, then add the generated copy.`,
        status: 409,
      },
    };
  return { workspaceId: source.workspace_id as string, target };
}

/** Turns pain point settings on for the target campaign when the copy uses them. */
async function syncPainPointSettings(
  supabase: { from: (t: string) => any },
  target: { id: string; ai_config: unknown; ai_enabled?: boolean | null },
  steps: Array<{ subject: string; body: string }>,
  painPointFallback: string,
) {
  const { normalizeAiConfig, painPointSlotsUsed } = await import("@/lib/ai-personalization-model");
  const used = steps.reduce(
    (max, step) => Math.max(max, painPointSlotsUsed(`${step.subject}\n${step.body}`)),
    0,
  );
  if (!used) return { painPointsPerLead: 0 };
  const config = {
    ...normalizeAiConfig(target.ai_config),
    painPointsPerLead: used,
    painPointFallback: painPointFallback.slice(0, 300),
  };
  const { error } = await supabase
    .from("campaigns")
    .update({ ai_config: config, ai_enabled: true })
    .eq("id", target.id);
  if (error) throw new Error(error.message);
  return { painPointsPerLead: used };
}

/**
 * Writes the generated sequence into an existing campaign, reusing the normal
 * campaign_steps storage. Steps are updated in place by order, so no duplicate
 * campaign is ever created and queued mail keeps its step references.
 */
export const applyWriterSequenceToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({
        targetCampaignId: z.string().uuid(),
        steps: z.array(applyStepSchema).min(1).max(10),
        painPointFallback: z.string().max(300).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await targetContext(
      context.supabase as never,
      data.campaignId,
      data.targetCampaignId,
    );
    if ("failure" in ctx) return ctx.failure;

    const { data: existing, error: existingError } = await context.supabase
      .from("campaign_steps")
      .select("id, step_order")
      .eq("campaign_id", data.targetCampaignId)
      .order("step_order", { ascending: true });
    if (existingError) throw new Error(existingError.message);
    const rows = (existing ?? []) as Array<{ id: string; step_order: number }>;

    for (const [index, step] of data.steps.entries()) {
      const order = index + 1;
      const current = rows.find((row) => row.step_order === order);
      const payload = {
        subject: step.subject,
        body: step.body,
        wait_days: index === 0 ? 0 : Math.max(1, step.waitDays),
        wait_hours: 0,
        step_type: "email",
        name: index === 0 ? "Initial email" : `Follow-up #${index}`,
      };
      if (current) {
        const { error } = await context.supabase
          .from("campaign_steps")
          .update(payload)
          .eq("id", current.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await context.supabase.from("campaign_steps").insert({
          campaign_id: data.targetCampaignId,
          workspace_id: ctx.workspaceId,
          step_order: order,
          same_thread: index > 0,
          delay_minutes: 0,
          config: {},
          ...payload,
        } as never);
        if (error) throw new Error(error.message);
      }
    }

    // Extra trailing steps are only removed when no mail references them.
    let kept = 0;
    for (const row of rows.filter((r) => r.step_order > data.steps.length)) {
      const { count } = await context.supabase
        .from("campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("step_id", row.id);
      if ((count ?? 0) > 0) {
        kept += 1;
        continue;
      }
      const { error } = await context.supabase.from("campaign_steps").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    const pain = await syncPainPointSettings(
      context.supabase as never,
      ctx.target as never,
      data.steps,
      data.painPointFallback,
    );

    return {
      ok: true as const,
      campaignName: (ctx.target as { name: string }).name,
      steps: data.steps.length,
      keptExtraSteps: kept,
      painPointsPerLead: pain.painPointsPerLead,
    };
  });

/** Replaces the copy of ONE step in an existing campaign ("Use this version"). */
export const applyWriterStepToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    campaignInput
      .extend({
        targetCampaignId: z.string().uuid(),
        stepOrder: z.number().int().min(1).max(10),
        step: applyStepSchema,
        painPointFallback: z.string().max(300).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await targetContext(
      context.supabase as never,
      data.campaignId,
      data.targetCampaignId,
    );
    if ("failure" in ctx) return ctx.failure;

    const { data: current, error } = await context.supabase
      .from("campaign_steps")
      .select("id")
      .eq("campaign_id", data.targetCampaignId)
      .eq("step_order", data.stepOrder)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const payload = {
      subject: data.step.subject,
      body: data.step.body,
      wait_days: data.stepOrder === 1 ? 0 : Math.max(1, data.step.waitDays),
      step_type: "email",
    };
    if (current?.id) {
      const { error: updateError } = await context.supabase
        .from("campaign_steps")
        .update(payload)
        .eq("id", current.id);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await context.supabase.from("campaign_steps").insert({
        campaign_id: data.targetCampaignId,
        workspace_id: ctx.workspaceId,
        step_order: data.stepOrder,
        name: data.stepOrder === 1 ? "Initial email" : `Follow-up #${data.stepOrder - 1}`,
        wait_hours: 0,
        delay_minutes: 0,
        same_thread: data.stepOrder > 1,
        config: {},
        ...payload,
      } as never);
      if (insertError) throw new Error(insertError.message);
    }

    await syncPainPointSettings(
      context.supabase as never,
      ctx.target as never,
      [data.step],
      data.painPointFallback,
    );

    return {
      ok: true as const,
      campaignName: (ctx.target as { name: string }).name,
      stepOrder: data.stepOrder,
    };
  });
