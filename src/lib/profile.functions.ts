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


/**
 * Permanently dismisses the guided-setup card for a workspace.
 *
 * The workspace UPDATE policy only allows owners and admins, so a plain member
 * pressing "Dismiss" would silently change nothing and the card would come back
 * on the next visit. Membership is verified with the caller's own RLS client
 * first, then the single flag is written with the service client — the only
 * field this ever touches.
 */
export const dismissChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership) throw new Error("You are not a member of this workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ checklist_dismissed: true })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Self-healing profile provisioning.
 *
 * The database trigger on sign-up can miss rows (for example when a user is
 * created outside the normal signup form). The app calls this right after a
 * session appears so every signed-in user always has a profile row.
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as Record<string, unknown> | null;
    const meta = (claims?.["user_metadata"] ?? {}) as Record<string, unknown>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin.from("profiles").upsert(
        {
          id: context.userId,
          email: (claims?.["email"] as string | undefined) ?? null,
          full_name:
            (meta["full_name"] as string | undefined) ??
            (meta["name"] as string | undefined) ??
            null,
          avatar_url: (meta["avatar_url"] as string | undefined) ?? null,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    }


    // Welcome email for genuinely new accounts only (never for backfilled
    // profiles of long-existing users).
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const createdAt = authUser?.user?.created_at ? Date.parse(authUser.user.created_at) : 0;
      if (createdAt && Date.now() - createdAt < 24 * 60 * 60 * 1000) {
        const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
        await emitTransactionalEvent({
          eventKey: "user.created",
          userId: context.userId,
          to: (claims?.["email"] as string | undefined) ?? null,
          idempotencyKey: `user.created:${context.userId}`,
          immediate: true,
        });
      }
    } catch {
      /* a welcome email must never block sign-in */
    }

    return { created: !existing };
  });
