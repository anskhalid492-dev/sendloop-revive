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
    .select("id, workspace_id, ai_config")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign?.workspace_id)
    return { failure: { ok: false as const, message: "Campaign not found.", status: 404 } };
  const workspaceId = campaign.workspace_id as string;

  const { requireEntitlement, evaluateEntitlement, EntitlementError } = await import(
    "@/lib/billing/usage.server"
  );
  try {
    await requireEntitlement(workspaceId, "ai_campaign_writer");
    const decision = await evaluateEntitlement(workspaceId, "ai_monthly", 1);
    if (!decision.allowed)
      return {
        failure: {
          ok: false as const,
          message: `You've used your AI allowance for the ${decision.planName} plan (${decision.used.toLocaleString()} of ${(decision.limit ?? 0).toLocaleString()}). Upgrade your plan to keep generating.`,
          status: 402,
        },
      };
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
  const credentials = await workspaceAiCredentials(
    supabaseAdmin,
    workspaceId,
    wanted === "anthropic" ? "anthropic" : wanted === "openai" ? "openai" : undefined,
  );
  if (!credentials)
    return {
      failure: {
        ok: false as const,
        message: "Connect an AI provider key (OpenAI or Claude) in the AI settings to use the campaign writer.",
        status: 401,
      },
    };
  return { workspaceId, credentials };
}

/** Wraps a generation so provider problems become readable, retryable messages. */
async function guard<T>(
  workspaceId: string,
  run: () => Promise<T>,
): Promise<({ ok: true } & T) | Failure> {
  const { AiGatewayError } = await import("@/lib/ai-personalization.server");
  const { consumeUsage } = await import("@/lib/billing/usage.server");
  try {
    const result = await run();
    await consumeUsage(workspaceId, "ai_monthly", 1, "ai_campaign_writer");
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
        index: z.number().int().min(0).max(6),
        total: z.number().int().min(1).max(7),
        purpose: z.string().max(300),
        previous: z.array(writerStepSchema).max(7).default([]),
        refinement: z.string().max(300).nullish(),
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
        steps: z.array(writerStepSchema).min(1).max(7),
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
