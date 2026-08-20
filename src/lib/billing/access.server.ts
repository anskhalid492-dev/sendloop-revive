/** Membership and admin guards for billing server functions. */
export async function assertWorkspaceMember(
  context: { supabase: any; userId: string },
  workspaceId: string,
) {
  const { data, error } = await context.supabase.rpc("is_workspace_member", {
    _workspace_id: workspaceId,
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: not a member of this workspace");
}

export async function assertWorkspaceBillingManager(
  context: { supabase: any; userId: string },
  workspaceId: string,
) {
  const { data, error } = await context.supabase.rpc("has_workspace_role", {
    _workspace_id: workspaceId,
    _user_id: context.userId,
    _roles: ["owner", "admin"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: only workspace owners and admins can manage billing");
}

export async function assertPlatformAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}
