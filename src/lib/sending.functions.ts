/**
 * Customer-facing sending accounts (Email Accounts).
 *
 * MunchReach owns and operates the sending infrastructure. Customers only ever
 * see the accounts assigned to their workspace, their health, capacity, warmup
 * and campaign usage. Nothing provider-specific (providers, pools, SMTP or API
 * credentials) is selected or returned here. Every mutation is enforced
 * server-side by workspace-role checked database functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACCOUNT_COLUMNS,
  buildAccountPage,
  loadAccountFacets,
  loadAccountStats,
  loadAllAccounts,
  decorate,
  type AccountPageResult,
} from "@/lib/sending-query";

export type { AccountPageResult };

export const listMySendingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadAllAccounts(context.supabase));

export const listEmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(200).default(50),
        search: z.string().max(200).default(""),
        status: z
          .enum(["all", "active", "warming", "paused", "inactive", "error"])
          .default("all"),
        warmup: z
          .enum(["all", "warming", "complete", "not_started", "attention"])
          .default("all"),
        health: z.enum(["all", "good", "fair", "poor"]).default("all"),
        domain: z.string().max(200).default("all"),
        campaignId: z.string().max(64).default("all"),
        sort: z
          .enum([
            "health",
            "sent_today",
            "daily_limit",
            "warmup",
            "last_activity",
            "created_at",
            "email",
          ])
          .default("created_at"),
        dir: z.enum(["asc", "desc"]).default("asc"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => buildAccountPage(context.supabase, data));

export const getEmailAccountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as never as { from: (t: string) => any })
      .from("sending_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("id", data.id)
      .not("workspace_id", "is", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Email account not found");

    const [stats, facets, warmupStats] = await Promise.all([
      loadAccountStats(context.supabase, [data.id]),
      loadAccountFacets(context.supabase),
      loadWarmupStats(context.supabase, [data.id]),
    ]);
    return {
      account: decorate(row, stats[data.id] ?? null, undefined, warmupStats[data.id] ?? null),
      stats: stats[data.id] ?? null,
      campaigns: facets.campaigns.filter((c) => c.accountIds.includes(data.id)),
    };
  });

export const setSendingAccountEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_sending_account_enabled", {
      _account_id: data.id,
      _enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });

export const bulkSetSendingAccountsPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        paused: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: affected, error } = await (context.supabase as never as {
      rpc: (fn: string, args: unknown) => Promise<{
        data: number | null;
        error: { message: string } | null;
      }>;
    }).rpc("set_sending_accounts_paused", {
      _account_ids: data.ids,
      _paused: data.paused,
    });
    if (error) throw new Error(error.message);
    return { ok: true, affected: affected ?? 0 };
  });

export type SendingAccountAuditEntry = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  actorName: string;
};

/**
 * Audit trail for one email account: who paused, resumed or requested removal,
 * and when. RLS limits rows to the caller's workspaces.
 */
export const listSendingAccountAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ accountId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SendingAccountAuditEntry[]> => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { data: rows, error } = await db
      .from("sending_account_audit")
      .select("id, action, detail, actor_id, created_at")
      .eq("sending_account_id", data.accountId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const entries = (rows ?? []) as Array<{
      id: string;
      action: string;
      detail: string | null;
      actor_id: string | null;
      created_at: string;
    }>;
    const actorIds = [...new Set(entries.map((e) => e.actor_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await db
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        names.set(p.id, p.full_name || p.email || "Workspace member");
      }
    }
    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      detail: e.detail,
      createdAt: e.created_at,
      actorName: (e.actor_id && names.get(e.actor_id)) || "MunchReach system",
    }));
  });
