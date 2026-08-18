import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfileSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, theme, timezone")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        full_name: z.string().trim().min(1).max(80).optional(),
        avatar_url: z.string().trim().url().max(500).nullish(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        timezone: z.string().trim().max(64).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      ...(data.full_name !== undefined ? { full_name: data.full_name } : {}),
      ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url ?? null } : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone ?? null } : {}),
    };

    const { error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS restricts the update to workspaces the caller can administer.
    const { error } = await context.supabase
      .from("workspaces")
      .update({ checklist_dismissed: true })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
