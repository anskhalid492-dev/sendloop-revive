import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Customer: redeem an AppSumo code for the current workspace. */
export const redeemAppSumoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; workspaceId: string }) =>
    z.object({ code: z.string().min(1).max(64), workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertWorkspaceBillingManager } = await import("@/lib/billing/access.server");
    const { admin, getBillingSettings } = await import("@/lib/billing/core.server");
    const { requestMeta } = await import("@/lib/admin-security.server");
    const { normalizeCode, assertRedeemRateLimit, publicMessageFor } = await import("@/lib/appsumo.server");

    await assertWorkspaceBillingManager(context, data.workspaceId);
    const db = await admin();
    const { ip, userAgent } = requestMeta();
    await assertRedeemRateLimit(db, context.userId, ip);

    const code = normalizeCode(data.code);
    const email = (context.claims as any)?.email ?? null;
    const settings = await getBillingSettings();
    if (!/^[A-Z0-9]{6,32}$/.test(code)) {
      await db.from("appsumo_redemption_logs").insert({
        code: code.slice(0, 64), user_id: context.userId, email, action: "redeem",
        success: false, failure_reason: "bad_format", ip_address: ip, user_agent: userAgent?.slice(0, 500),
      });
      return { ok: false as const, message: publicMessageFor("bad_format") };
    }
    const { data: result, error } = await db.rpc("redeem_appsumo_code", {
      _code: code,
      _user_id: context.userId,
      _email: email,
      _workspace_id: data.workspaceId,
      _environment: settings.environment,
      _ip: ip,
      _user_agent: userAgent,
    });
    if (error) throw new Error("We couldn't redeem that code right now. Please try again.");
    const r = result as { ok: boolean; reason?: string; subscription_id?: string };
    if (!r.ok) return { ok: false as const, message: publicMessageFor(r.reason ?? "") };
    if (r.subscription_id && settings.environment) {
      const { activateAppSumoEntitlement } = await import("@/lib/appsumo.server");
      try {
        await activateAppSumoEntitlement(db, data.workspaceId, r.subscription_id);
      } catch (e) {
        console.error("[appsumo] entitlement activation failed", e);
        throw new Error("Your code was accepted but access is still activating. Please contact support.");
      }
    }
    return { ok: true as const };
  });

async function guard(context: any, sensitive = false) {
  const { assertSuperAdmin } = await import("@/lib/admin-access.server");
  await assertSuperAdmin(context, { sensitive, action: "appsumo" });
  const { admin } = await import("@/lib/billing/core.server");
  return admin();
}

export const getAppSumoAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; status?: string; batch?: string; page?: number }) =>
    z
      .object({
        search: z.string().max(100).optional(),
        status: z.enum(["all", "available", "redeemed", "revoked"]).default("all"),
        batch: z.enum(["all", "production", "test"]).default("all"),
        page: z.number().int().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const count = async (status?: string) => {
      let q = db.from("appsumo_codes").select("id", { count: "exact", head: true });
      if (status) q = q.eq("status", status);
      const { count: c } = await q;
      return c ?? 0;
    };
    const [total, available, redeemed, revoked] = await Promise.all([
      count(), count("available"), count("redeemed"), count("revoked"),
    ]);
    const pageSize = 100;
    let q = db
      .from("appsumo_codes")
      .select("id, code, status, batch, redeemed_email, redeemed_at, revoked_at, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.page * pageSize, data.page * pageSize + pageSize - 1);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.batch !== "all") q = q.eq("batch", data.batch);
    const s = data.search?.trim();
    if (s) {
      const safe = s.replace(/[%_,()\\]/g, "");
      q = q.or(`code.ilike.%${safe.toUpperCase()}%,redeemed_email.ilike.%${safe}%`);
    }
    const { data: rows, count: filtered, error } = await q;
    if (error) throw new Error(error.message);
    return { stats: { total, available, redeemed, revoked }, rows: rows ?? [], filtered: filtered ?? 0, pageSize };
  });

export const generateAppSumoCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { count: number; batch: "production" | "test" }) =>
    z.object({ count: z.number().int().min(1).max(5000), batch: z.enum(["production", "test"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await guard(context, true);
    const { data: made, error } = await db.rpc("generate_appsumo_codes", { _count: data.count, _batch: data.batch });
    if (error) throw new Error(error.message);
    await db.from("appsumo_redemption_logs").insert({
      user_id: context.userId, action: `generate_${data.batch}`, success: true, failure_reason: `count=${made}`,
    });
    return { made: made as number };
  });

export const revokeAppSumoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codeId: string }) => z.object({ codeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context, true);
    const { data: r, error } = await db.rpc("revoke_appsumo_code", { _code_id: data.codeId, _actor: context.userId });
    if (error) throw new Error(error.message);
    const { revokeAppSumoEntitlement } = await import("@/lib/appsumo.server");
    // The code is already revoked; a downgrade problem must not report the
    // revoke itself as failed. Surface it as a warning instead.
    try {
      const res = await revokeAppSumoEntitlement(db, data.codeId);
      return { ...(r as { ok: boolean }), downgraded: res.downgraded, warning: null as string | null };
    } catch (e) {
      console.error("[appsumo] entitlement downgrade failed after revoke", e);
      return {
        ...(r as { ok: boolean }),
        downgraded: false,
        warning: "Code revoked, but the workspace plan could not be downgraded automatically. Change it manually." as string | null,
      };
    }
  });

export const exportAppSumoCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope: "available" | "all" }) =>
    z.object({ scope: z.enum(["available", "all"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const { toAppSumoCsv } = await import("@/lib/appsumo.server");
    const codes: string[] = [];
    for (let from = 0; ; from += 1000) {
      let q = db.from("appsumo_codes").select("code").eq("batch", "production")
        .order("created_at", { ascending: true }).order("code").range(from, from + 999);
      if (data.scope === "available") q = q.eq("status", "available");
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      codes.push(...(rows ?? []).map((r: any) => r.code));
      if (!rows || rows.length < 1000) break;
    }
    await db.from("appsumo_redemption_logs").insert({
      user_id: context.userId, action: `export_${data.scope}`, success: true, failure_reason: `rows=${codes.length}`,
    });
    return { csv: toAppSumoCsv(codes), rows: codes.length };
  });
