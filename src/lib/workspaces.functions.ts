import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  outreach_type: string | null;
  role: string;
};

export const getMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Scoped to the caller's own memberships (platform admins must not see
    // every workspace in their customer dashboard).
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, name, slug, owner_id, created_at, outreach_type, workspace_members!inner(role, user_id)")
      .eq("workspace_members.user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((w) => {
      const { workspace_members, ...rest } = w as typeof w & {
        workspace_members: { role: string }[];
      };
      return { ...rest, role: workspace_members[0]?.role ?? "member" } as Workspace;
    });
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(2).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const { checkWorkspaceQuota } = await import("@/lib/billing/usage.server");
    await checkWorkspaceQuota(context.userId);

    const base =
      data.name

        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "workspace";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

    const { data: workspace, error } = await context.supabase
      .from("workspaces")
      .insert({ name: data.name, slug, owner_id: context.userId })
      .select("id, name, slug, owner_id, created_at")
      .single();
    if (error) throw new Error(error.message);

    // A database trigger already seeds the owner membership; upsert keeps this
    // idempotent instead of failing on the unique (workspace_id, user_id) key.
    const { error: memberError } = await context.supabase
      .from("workspace_members")
      .upsert(
        { workspace_id: workspace.id, user_id: context.userId, role: "owner" },
        { onConflict: "workspace_id,user_id" },
      );
    if (memberError) throw new Error(memberError.message);

    return workspace as Workspace;
  });
