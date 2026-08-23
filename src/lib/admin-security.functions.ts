/**
 * Admin security console server functions: sessions, security events,
 * permission grants and emergency revocation. Every handler re-verifies the
 * platform role server-side; nothing here trusts client state.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PERMISSIONS = [
  "billing:manage",
  "support:manage",
  "content:manage",
  "security:manage",
  "customers:read",
  "customers:export",
  "infrastructure:manage",
] as const;

/**
 * Identity for the admin shell. Deliberately does NOT require MFA so an admin
 * can reach the enrollment screen; it reports the MFA state instead.
 */
export const getAdminSecurityIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getPlatformRole } = await import("./admin-access.server");
    const security = await import("./admin-security.server");
    const role = await getPlatformRole(context);
    if (!role) return { role: null, isSuperAdmin: false, mfa: null, permissions: [] as string[] };

    const { revoked } = await security.touchAdminSession(context);
    if (revoked) throw new Error("Unauthorized: this admin session was revoked. Sign in again.");

    const mfa = await security.adminMfaState(context);
    const permissions = role === "super_admin" ? [...PERMISSIONS] : await security.listAdminPermissions(context);
    return { role, isSuperAdmin: role === "super_admin", mfa, permissions };
  });

export const adminSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    const security = await import("./admin-security.server");
    try {
      await assertSuperAdmin(context, { action: "view security console" });
      const [sessions, events, grants] = await Promise.all([
        security.listAdminSessions(),
        (async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await (supabaseAdmin as any)
            .from("admin_security_events")
            .select("id, user_id, email, event_type, result, ip, user_agent, detail, created_at")
            .order("created_at", { ascending: false })
            .limit(100);
          return data ?? [];
        })(),
        (async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await (supabaseAdmin as any)
            .from("admin_permission_grants")
            .select("id, user_id, permission, created_at")
            .order("created_at", { ascending: false })
            .limit(200);
          return data ?? [];
        })(),
      ]);
      return { sessions, events, grants, permissions: [...PERMISSIONS] };
    } catch (error) {
      throw security.safeAdminError(error, "The security console could not be loaded.");
    }
  });

export const adminRevokeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionRowId: string }) =>
    z.object({ sessionRowId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    const security = await import("./admin-security.server");
    try {
      await assertSuperAdmin(context, { sensitive: true, action: "revoke admin session" });
      return await security.revokeAdminSession(data.sessionRowId, context.userId);
    } catch (error) {
      throw security.safeAdminError(error, "The session could not be revoked.");
    }
  });

export const adminRevokeAllSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetUserId?: string; keepCurrent?: boolean }) =>
    z
      .object({ targetUserId: z.string().uuid().optional(), keepCurrent: z.boolean().default(true) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    const security = await import("./admin-security.server");
    try {
      await assertSuperAdmin(context, { sensitive: true, action: "revoke all admin sessions" });
      return await security.revokeAllAdminSessions({
        actorId: context.userId,
        targetUserId: data.targetUserId,
        keepCurrentSessionOfClaims: data.keepCurrent ? context.claims : undefined,
      });
    } catch (error) {
      throw security.safeAdminError(error, "Sessions could not be revoked.");
    }
  });

export const adminSetPermissionGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; permission: string; granted: boolean }) =>
    z
      .object({
        userId: z.string().uuid(),
        permission: z.enum(PERMISSIONS),
        granted: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    const security = await import("./admin-security.server");
    try {
      await assertSuperAdmin(context, { sensitive: true, action: "change admin permissions" });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as any;
      if (data.granted) {
        await db
          .from("admin_permission_grants")
          .upsert(
            { user_id: data.userId, permission: data.permission, granted_by: context.userId },
            { onConflict: "user_id,permission" },
          );
      } else {
        await db
          .from("admin_permission_grants")
          .delete()
          .eq("user_id", data.userId)
          .eq("permission", data.permission);
      }
      await security.recordSecurityEvent({
        userId: context.userId,
        eventType: "admin_permission_changed",
        detail: `${data.granted ? "Granted" : "Revoked"} ${data.permission} for ${data.userId}`,
      });
      return { ok: true };
    } catch (error) {
      throw security.safeAdminError(error, "The permission could not be updated.");
    }
  });

/** Records an MFA enrollment/verification outcome from the client flow. */
export const adminRecordMfaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event: string; success: boolean }) =>
    z.object({ event: z.string().max(60), success: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const security = await import("./admin-security.server");
    await security.assertRateLimit({
      bucket: `mfa:${context.userId}`,
      limit: 20,
      windowSeconds: 300,
      userId: context.userId,
      action: "MFA attempt",
    });
    await security.recordSecurityEvent({
      userId: context.userId,
      eventType: `admin_mfa_${data.event}`.slice(0, 60),
      result: data.success ? "success" : "failure",
    });
    return { ok: true };
  });
