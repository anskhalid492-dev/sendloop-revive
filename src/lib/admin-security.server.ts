/**
 * Admin security core (server only).
 *
 * Single place for the privileged-access controls used by every admin server
 * function: session registry + revocation, MFA (AAL2) enforcement, recent
 * re-authentication for dangerous actions, rate limiting, append-only security
 * event logging and safe error shaping.
 *
 * Nothing here trusts client input: role, session state and authentication
 * level all come from the verified Supabase JWT claims or the database.
 */
import { getRequest } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminClaims = Record<string, any> | undefined;

export type AdminContext = {
  supabase: any;
  userId: string;
  claims?: AdminClaims;
};

/** Granular admin permissions. A platform `admin` implicitly holds all of them. */
export const ADMIN_PERMISSIONS = [
  "billing:manage",
  "support:manage",
  "content:manage",
  "security:manage",
  "customers:read",
  "customers:export",
  "infrastructure:manage",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/* ------------------------------------------------------------------ */
/* Request metadata                                                    */
/* ------------------------------------------------------------------ */

export function requestMeta(): { ip: string | null; userAgent: string | null } {
  try {
    const request = getRequest();
    const headers = request?.headers;
    if (!headers) return { ip: null, userAgent: null };
    const forwarded = headers.get("x-forwarded-for");
    const ip =
      headers.get("cf-connecting-ip") ??
      (forwarded ? forwarded.split(",")[0]!.trim() : null) ??
      headers.get("x-real-ip");
    return { ip: ip ?? null, userAgent: headers.get("user-agent")?.slice(0, 400) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/* ------------------------------------------------------------------ */
/* Security events (append-only)                                       */
/* ------------------------------------------------------------------ */

export async function recordSecurityEvent(input: {
  userId?: string | null;
  email?: string | null;
  eventType: string;
  result?: "success" | "denied" | "failure";
  detail?: string | null;
}) {
  const { ip, userAgent } = requestMeta();
  try {
    await (supabaseAdmin as any).from("admin_security_events").insert({
      user_id: input.userId ?? null,
      email: input.email ?? null,
      event_type: input.eventType,
      result: input.result ?? "success",
      detail: input.detail ? input.detail.slice(0, 500) : null,
      ip,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error("[admin-security] failed to record security event", error);
  }
}

/* ------------------------------------------------------------------ */
/* Session registry                                                    */
/* ------------------------------------------------------------------ */

function sessionIdFrom(claims: AdminClaims): string | null {
  const value = claims?.["session_id"] ?? claims?.["sid"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Last time the user actually authenticated (password / OAuth / MFA), in seconds. */
export function lastAuthAt(claims: AdminClaims): number | null {
  const amr = claims?.["amr"];
  if (Array.isArray(amr) && amr.length) {
    const stamps = amr
      .map((entry: any) => Number(entry?.timestamp ?? entry?.ts ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (stamps.length) return Math.max(...stamps);
  }
  const iat = Number(claims?.["iat"] ?? 0);
  return Number.isFinite(iat) && iat > 0 ? iat : null;
}

export function authLevel(claims: AdminClaims): string {
  const aal = claims?.["aal"];
  return typeof aal === "string" ? aal : "aal1";
}

/**
 * Records/refreshes the admin session row and reports whether it was revoked.
 * Revocation is enforced on every privileged call, so a revoked admin session
 * stops working immediately even though the Supabase JWT is still valid.
 */
export async function touchAdminSession(context: AdminContext): Promise<{ revoked: boolean }> {
  const sessionId = sessionIdFrom(context.claims);
  if (!sessionId) return { revoked: false };
  const { ip, userAgent } = requestMeta();
  const db = supabaseAdmin as any;

  const { data: existing } = await db
    .from("admin_sessions")
    .select("id, revoked_at")
    .eq("user_id", context.userId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing?.revoked_at) return { revoked: true };

  if (existing) {
    await db
      .from("admin_sessions")
      .update({ last_seen_at: new Date().toISOString(), aal: authLevel(context.claims), ip, user_agent: userAgent })
      .eq("id", existing.id);
  } else {
    await db.from("admin_sessions").insert({
      user_id: context.userId,
      session_id: sessionId,
      ip,
      user_agent: userAgent,
      aal: authLevel(context.claims),
    });
    await recordSecurityEvent({
      userId: context.userId,
      eventType: "admin_session_started",
      detail: `New admin session (${authLevel(context.claims)})`,
    });
  }
  return { revoked: false };
}

export async function listAdminSessions(userId?: string) {
  const db = supabaseAdmin as any;
  let query = db
    .from("admin_sessions")
    .select("id, user_id, ip, user_agent, aal, created_at, last_seen_at, revoked_at")
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // session_id is never selected: raw session identifiers stay server-side.
  return data ?? [];
}

export async function revokeAdminSession(sessionRowId: string, actorId: string) {
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actorId })
    .eq("id", sessionRowId)
    .is("revoked_at", null)
    .select("id, user_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await recordSecurityEvent({
    userId: actorId,
    eventType: "admin_session_revoked",
    detail: data ? `Revoked admin session for user ${data.user_id}` : "Session already revoked",
  });
  return { revoked: Boolean(data) };
}

export async function revokeAllAdminSessions(input: {
  actorId: string;
  targetUserId?: string | undefined;
  keepCurrentSessionOfClaims?: AdminClaims | undefined;
}) {
  const db = supabaseAdmin as any;
  let query = db
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_by: input.actorId })
    .is("revoked_at", null);
  if (input.targetUserId) query = query.eq("user_id", input.targetUserId);
  const keep = sessionIdFrom(input.keepCurrentSessionOfClaims);
  if (keep) query = query.neq("session_id", keep);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  await recordSecurityEvent({
    userId: input.actorId,
    eventType: "admin_sessions_bulk_revoked",
    detail: `${data?.length ?? 0} admin session(s) revoked${input.targetUserId ? ` for user ${input.targetUserId}` : ""}`,
  });
  return { revoked: data?.length ?? 0 };
}

/* ------------------------------------------------------------------ */
/* MFA                                                                 */
/* ------------------------------------------------------------------ */

/** True when the account has at least one verified TOTP factor. */
export async function hasVerifiedMfaFactor(userId: string): Promise<boolean> {
  try {
    const { data, error } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
    if (error) return false;
    const factors = data?.user?.factors ?? [];
    return factors.some((factor: any) => factor?.status === "verified");
  } catch {
    return false;
  }
}

/**
 * Two-factor is MANDATORY for platform admin/support roles (TOTP authenticator).
 * Admins who already existed when the rule shipped get a short setup window in
 * which ordinary (non-sensitive) admin calls still work while they enroll;
 * sensitive actions never get grace. After the window, admin access requires a
 * verified factor and an AAL2 session outright.
 */
export const ADMIN_MFA_GRACE_UNTIL = Date.parse("2026-09-18T23:59:59Z");

export function adminMfaGraceActive(now = Date.now()): boolean {
  return now < ADMIN_MFA_GRACE_UNTIL;
}

export async function adminMfaState(context: AdminContext) {
  const enrolled = await hasVerifiedMfaFactor(context.userId);
  const satisfied = authLevel(context.claims) === "aal2";
  return {
    enrolled,
    satisfied,
    required: true,
    graceActive: adminMfaGraceActive(),
    graceEndsAt: new Date(ADMIN_MFA_GRACE_UNTIL).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

export async function adminRateLimit(bucket: string, limit: number, windowSeconds: number) {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc("admin_rate_limit_hit", {
      _bucket: bucket,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) return { allowed: true };
    return data as { allowed: boolean; hits: number; retry_after_seconds: number };
  } catch {
    return { allowed: true };
  }
}

export async function assertRateLimit(input: {
  bucket: string;
  limit: number;
  windowSeconds: number;
  userId?: string;
  action: string;
}) {
  const result = await adminRateLimit(input.bucket, input.limit, input.windowSeconds);
  if (!result.allowed) {
    await recordSecurityEvent({
      userId: input.userId ?? null,
      eventType: "admin_rate_limited",
      result: "denied",
      detail: `Rate limit reached for ${input.action}`,
    });
    throw new Error("Too many attempts. Please wait a moment and try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Re-authentication for sensitive actions                             */
/* ------------------------------------------------------------------ */

export const SENSITIVE_REAUTH_WINDOW_SECONDS = 15 * 60;

export async function assertRecentAuth(context: AdminContext, action: string) {
  const at = lastAuthAt(context.claims);
  const age = at ? Math.floor(Date.now() / 1000) - at : Number.MAX_SAFE_INTEGER;
  if (age > SENSITIVE_REAUTH_WINDOW_SECONDS) {
    await recordSecurityEvent({
      userId: context.userId,
      eventType: "admin_reauth_required",
      result: "denied",
      detail: action,
    });
    throw new Error("Re-authentication required: sign in again to perform this action.");
  }
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

export async function hasAdminPermission(context: AdminContext, permission: AdminPermission) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_admin_permission", {
    _user_id: context.userId,
    _permission: permission,
  });
  if (error) return false;
  return Boolean(data);
}

export async function listAdminPermissions(context: AdminContext): Promise<AdminPermission[]> {
  const { data } = await context.supabase
    .from("admin_permission_grants")
    .select("permission")
    .eq("user_id", context.userId);
  return (data ?? []).map((row: any) => row.permission as AdminPermission);
}

/* ------------------------------------------------------------------ */
/* Safe errors                                                         */
/* ------------------------------------------------------------------ */

const SAFE_PREFIXES = ["Forbidden", "Unauthorized", "Re-authentication", "Too many attempts", "Additional verification"];

/** Logs the technical detail server-side and returns a safe, generic message. */
export function safeAdminError(error: unknown, fallback = "That action could not be completed."): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (SAFE_PREFIXES.some((prefix) => message.startsWith(prefix))) return new Error(message);
  console.error("[admin] operation failed:", error);
  return new Error(fallback);
}
