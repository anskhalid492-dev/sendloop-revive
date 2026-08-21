import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

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
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { workspaceAiKeyInfo } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return workspaceAiKeyInfo(supabaseAdmin, data.workspaceId);
  });

export const saveWorkspaceAiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    workspaceInput
      .extend({
        apiKey: z.string().min(20).max(300),
        model: z.string().min(2).max(60),
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
      model: data.model,
      userId: context.userId,
    });
  });

export const deleteWorkspaceAiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId);
    const { deleteWorkspaceAiKey } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await deleteWorkspaceAiKey(supabaseAdmin, data.workspaceId);
    return { ok: true as const };
  });
