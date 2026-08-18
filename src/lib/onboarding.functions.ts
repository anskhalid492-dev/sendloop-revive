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

    return {
      completed: Boolean(profile?.onboarding_completed),
      fullName: profile?.full_name ?? null,
      workspaceCount: count ?? 0,
    };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceName: z.string().trim().min(2).max(60),
        companyName: z.string().trim().max(80).optional().nullable(),
        logoUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
        persona: z.string().trim().max(40).optional().nullable(),
        teamSize: z.string().trim().max(20).optional().nullable(),
        goal: z.string().trim().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const base =
      data.workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "workspace";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

    const { data: workspace, error } = await context.supabase
      .from("workspaces")
      .insert({
        name: data.workspaceName,
        slug,
        owner_id: context.userId,
        company_name: data.companyName || null,
        logo_url: data.logoUrl || null,
        persona: data.persona || null,
        team_size: data.teamSize || null,
        outreach_goal: data.goal || null,
        onboarding_completed: true,
      })
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);

    const { error: memberError } = await context.supabase
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: context.userId, role: "owner" });
    if (memberError) throw new Error(memberError.message);

    const { error: profileError } = await context.supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", context.userId);
    if (profileError) throw new Error(profileError.message);

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
