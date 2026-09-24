import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });
const providerEnum = z.enum(["openai", "anthropic"]);
const modelId = z.string().trim().min(1, "Choose a model.").max(200);

/** RLS-checked membership: the caller can only see workspaces they belong to. */
async function assertMember(supabase: unknown, workspaceId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace not found.");
}

export const getWorkspaceAiKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.extend({ provider: providerEnum.optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { workspaceAiKeyInfo } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return workspaceAiKeyInfo(supabaseAdmin, data.workspaceId, data.provider ?? null);
  });

/** Every AI provider this workspace has connected (never the key itself). */
export const listWorkspaceAiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { workspaceAiKeys } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return workspaceAiKeys(supabaseAdmin, data.workspaceId);
  });

/**
 * Live model list from the provider's Models API for this workspace's key.
 * Called on open and by "Refresh models". The key never leaves the server.
 */
export const listAiProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.extend({ provider: providerEnum }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { listWorkspaceAiModels } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return listWorkspaceAiModels(supabaseAdmin, data.workspaceId, data.provider);
  });

/** Save the workspace's model for a provider — verified live against the key. */
export const selectAiProviderModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    workspaceInput.extend({ provider: providerEnum, model: modelId }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);
    const { selectWorkspaceAiModel } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return selectWorkspaceAiModel(supabaseAdmin, data);
  });

export const saveWorkspaceAiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    workspaceInput
      .extend({
        // Customer-facing message: never leak raw validator text.
        apiKey: z
          .string()
          .trim()
          .min(20, "Invalid API key. Please check your key and try again.")
          .max(500, "Invalid API key. Please check your key and try again."),
        model: z.string().trim().max(200).optional().nullable(),
        provider: providerEnum.default("openai"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { saveWorkspaceAiKey } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return saveWorkspaceAiKey(supabaseAdmin, {
      workspaceId: data.workspaceId,
      apiKey: data.apiKey,
      model: data.model ?? null,
      provider: data.provider,
      userId: context.userId,
    });
  });

export const deleteWorkspaceAiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.extend({ provider: providerEnum.optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { deleteWorkspaceAiKey } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await deleteWorkspaceAiKey(supabaseAdmin, data.workspaceId, data.provider ?? null);
    return { ok: true as const };
  });
