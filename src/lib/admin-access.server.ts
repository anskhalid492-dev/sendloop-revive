/**
 * Platform admin authorization.
 *
 * The platform role lives in `public.user_roles` and is read through the
 * security-definer `has_role` function using the caller's own (RLS-bound)
 * client — never the service-role client — so a request can never elevate
 * itself. `admin` is the super admin tier for the admin dashboard.
 */
export type AdminRole = "super_admin" | "support" | "viewer";

export async function getPlatformRole(context: {
  supabase: any;
  userId: string;
}): Promise<AdminRole | null> {
  const [{ data: isAdmin, error: adminError }, { data: isSupport, error: supportError }] =
    await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "support" }),
    ]);
  if (adminError) throw new Error(adminError.message);
  if (supportError) throw new Error(supportError.message);
  if (isAdmin) return "super_admin";
  if (isSupport) return "support";
  return null;
}

/** Throws unless the caller holds the platform super admin role. */
export async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const role = await getPlatformRole(context);
  if (role !== "super_admin") throw new Error("Forbidden: super admin role required");
  return role;
}
