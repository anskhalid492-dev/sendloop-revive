/**
 * Admin → AI Provider (super admin only). Configures the single
 * MunchReach-owned AI provider used by the AI Sales Agent. Responses never
 * contain the API key — only a masked indicator.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SALES_AGENT_AI_PROVIDERS, isModelId } from "@/lib/sales-agent-provider";

async function guard(context: Parameters<typeof import("./admin-access.server").assertSuperAdmin>[0], action: string) {
  const { assertSuperAdmin } = await import("./admin-access.server");
  await assertSuperAdmin(context, { action });
}

export const getSalesAgentProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context, "view AI provider settings");
    const { getProviderView } = await import("./sales-agent-provider.server");
    return getProviderView();
  });

export const saveSalesAgentProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        provider: z.enum(SALES_AGENT_AI_PROVIDERS),
        model: z.string().trim().min(1).max(120).refine(isModelId, "Invalid model name."),
        apiKey: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await guard(context, "change AI provider settings");
    const { saveProviderConfig } = await import("./sales-agent-provider.server");
    return saveProviderConfig(data);
  });

export const removeSalesAgentProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context, "remove AI provider key");
    const { removeProviderKey } = await import("./sales-agent-provider.server");
    return removeProviderKey();
  });

export const testSalesAgentProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context, "test AI provider connection");
    const { testProviderConnection } = await import("./sales-agent-provider.server");
    return testProviderConnection();
  });
