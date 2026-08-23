/**
 * Platform admin authorization.
 *
 * The platform role lives in `public.user_roles` and is read through the
 * security-definer `has_role` function using the caller's own (RLS-bound)
 * client — never the service-role client — so a request can never elevate
 * itself. `admin` is the super admin tier for the admin dashboard.
 *
 * Every privileged call also passes through the admin security core:
 *  - the admin session registry (revoked sessions stop working immediately),
 *  - MFA/AAL2 enforcement once a second factor is enrolled,
 *  - optional granular permission and recent-re-authentication checks.
 */
import type { AdminContext, AdminPermission } from "./admin-security.server";

export type AdminRole = "super_admin" | "support" | "viewer";

export type AdminGuardOptions = {
  /** Extra granular permission the caller must hold (super admins hold all). */
  permission?: AdminPermission;
  /** Dangerous operation: requires AAL2 and a recent authentication. */
  sensitive?: boolean;
  /** Human label used in the security event log. */
  action?: string;
};

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

/**
 * Shared session / MFA / re-auth enforcement for any privileged admin call.
 * Callers must already have proven the platform role.
 */
export async function enforceAdminSessionPolicy(
  context: AdminContext,
  options: AdminGuardOptions = {},
) {
  const security = await import("./admin-security.server");

  const { revoked } = await security.touchAdminSession(context);
  if (revoked) {
    await security.recordSecurityEvent({
      userId: context.userId,
      eventType: "admin_revoked_session_blocked",
      result: "denied",
      detail: options.action ?? "admin request",
    });
    throw new Error("Unauthorized: this admin session was revoked. Sign in again.");
  }

  const level = security.authLevel(context.claims);
  if (level !== "aal2") {
    // Strict for dangerous operations; for everything else MFA is enforced as
    // soon as the account has a verified factor (enrollment stays possible).
    const enrolled = await security.hasVerifiedMfaFactor(context.userId);
    if (options.sensitive || enrolled) {
      await security.recordSecurityEvent({
        userId: context.userId,
        eventType: "admin_mfa_required",
        result: "denied",
        detail: options.action ?? "admin request",
      });
      throw new Error("Additional verification required: complete two-factor authentication.");
    }
  }

  if (options.permission) {
    const allowed = await security.hasAdminPermission(context, options.permission);
    if (!allowed) {
      await security.recordSecurityEvent({
        userId: context.userId,
        eventType: "admin_permission_denied",
        result: "denied",
        detail: `${options.permission} — ${options.action ?? "admin request"}`,
      });
      throw new Error("Forbidden: missing required admin permission");
    }
  }

  if (options.sensitive) {
    await security.assertRecentAuth(context, options.action ?? "sensitive admin action");
    await security.assertRateLimit({
      bucket: `sensitive:${context.userId}`,
      limit: 30,
      windowSeconds: 300,
      userId: context.userId,
      action: options.action ?? "sensitive admin action",
    });
  }
}

/** Throws unless the caller holds the platform super admin role. */
export async function assertSuperAdmin(context: AdminContext, options: AdminGuardOptions = {}) {
  const role = await getPlatformRole(context);
  if (role !== "super_admin") {
    const { recordSecurityEvent } = await import("./admin-security.server");
    await recordSecurityEvent({
      userId: context.userId,
      eventType: "admin_access_denied",
      result: "denied",
      detail: options.action ?? "admin request",
    });
    throw new Error("Forbidden: super admin role required");
  }
  await enforceAdminSessionPolicy(context, options);
  return role;
}
