import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PERSONAS = ["Agency", "SaaS", "Sales Team", "Recruiter", "Consultant", "Other"] as const;
export const TEAM_SIZES = ["Just me", "2-5", "6-20", "21-50", "51+"] as const;
export const GOALS = ["Lead Generation", "Sales", "Recruiting", "Partnerships", "Other"] as const;

export const getOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile, error: profileError }, { count, error: memberError }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, full_name, onboarding_completed")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId),
    ]);
    if (profileError) throw new Error(profileError.message);
    if (memberError) throw new Error(memberError.message);

    // Admin → System settings → General can switch customer onboarding off;
    // when it is disabled the wizard is skipped entirely.
    let onboardingEnabled = true;
    try {
      const { readSettings } = await import("@/lib/platform-settings.server");
      const general = await readSettings("general");
      onboardingEnabled = general["onboarding_enabled"] !== false;
    } catch {
      onboardingEnabled = true;
    }

    return {
      onboardingEnabled,
      completed: !onboardingEnabled || Boolean(profile?.onboarding_completed),
      fullName: profile?.full_name ?? null,
      workspaceCount: count ?? 0,
    };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceName: z.string().trim().min(2).max(200),
        companyName: z.string().trim().max(80).optional().nullable(),
        logoUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
        persona: z.string().trim().max(40).optional().nullable(),
        teamSize: z.string().trim().max(20).optional().nullable(),
        goal: z.string().trim().max(40).optional().nullable(),
        // Optional birthday, stored as a plain calendar date on the profile.
        birthday: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable()
          .or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Workspace name length is a platform-wide validation ceiling set in
    // Admin → System settings → Platform limits.
    const { platformLimit } = await import("@/lib/platform-settings.server");
    const maxName = await platformLimit("max_workspace_name_length", 60);
    if (data.workspaceName.length > maxName) {
      throw new Error(`Workspace name must be ${maxName} characters or fewer`);
    }

    const base =

      data.workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "workspace";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

    const profileFields = {
      name: data.workspaceName,
      company_name: data.companyName || null,
      logo_url: data.logoUrl || null,
      persona: data.persona || null,
      team_size: data.teamSize || null,
      outreach_goal: data.goal || null,
      onboarding_completed: true,
    };

    // Re-running onboarding (page refresh, a second Finish click) must not
    // create a second workspace for the same owner: reuse the one they own.
    const { data: owned, error: ownedError } = await context.supabase
      .from("workspaces")
      .select("id, name, slug")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownedError) throw new Error(ownedError.message);

    let workspace: { id: string; name: string; slug: string };
    if (owned) {
      const { data: updated, error: updateError } = await context.supabase
        .from("workspaces")
        .update(profileFields)
        .eq("id", owned.id)
        .select("id, name, slug")
        .single();
      if (updateError) throw new Error(updateError.message);
      workspace = updated;
    } else {
      const { data: created, error } = await context.supabase
        .from("workspaces")
        .insert({ ...profileFields, slug, owner_id: context.userId })
        .select("id, name, slug")
        .single();
      if (error) throw new Error(error.message);
      workspace = created;
    }

    // The workspaces trigger already seeds the owner membership. Never UPDATE
    // that row from the client — owner rows are intentionally not editable
    // under `members_update_admin`, so an upsert here fails RLS. See
    // src/lib/workspace-onboarding.ts.
    const { ensureOwnerMembership } = await import("@/lib/workspace-onboarding");
    await ensureOwnerMembership(
      context.supabase as unknown as import("@/lib/workspace-onboarding").MembershipClient,
      workspace.id,
      context.userId,
    );

    const { error: profileError } = await context.supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", context.userId);
    if (profileError) throw new Error(profileError.message);

    // Birthday is optional and written separately so an older database (before
    // the birthday column exists) never breaks onboarding.
    if (data.birthday) {
      try {
        await (context.supabase.from("profiles") as unknown as {
          update: (patch: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
        })
          .update({ birthday: data.birthday })
          .eq("id", context.userId);
      } catch {
        /* birthday is a nice-to-have, never a blocker */
      }
    }

    return workspace;
  });

/** Marks onboarding done without creating a workspace (user already has one). */
export const markOnboardingComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
