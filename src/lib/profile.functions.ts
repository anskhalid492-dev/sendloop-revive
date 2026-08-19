import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfileSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "id, email, full_name, first_name, last_name, display_name, avatar_url, theme, timezone",
      )
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
        first_name: z.string().trim().max(60).nullish(),
        last_name: z.string().trim().max(60).nullish(),
        display_name: z.string().trim().max(80).nullish(),
        full_name: z.string().trim().min(1).max(80).optional(),
        avatar_url: z.string().trim().max(500).nullish(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        timezone: z.string().trim().max(64).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const first = data.first_name?.trim() ?? "";
    const last = data.last_name?.trim() ?? "";
    const composed = [first, last].filter(Boolean).join(" ");

    const patch = {
      ...(data.first_name !== undefined ? { first_name: first || null } : {}),
      ...(data.last_name !== undefined ? { last_name: last || null } : {}),
      ...(data.display_name !== undefined
        ? { display_name: data.display_name?.trim() || null }
        : {}),
      ...(data.full_name !== undefined
        ? { full_name: data.full_name }
        : composed
          ? { full_name: composed }
          : {}),
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

/**
 * Email changes go through Supabase Auth so the new address must be confirmed
 * by clicking a link; the profile row is only updated by the auth webhook/user
 * after confirmation.
 */
export const requestEmailChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().trim().email() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ email: data.email });
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
