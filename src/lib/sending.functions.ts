/**
 * Customer-facing sending accounts (Email Accounts).
 *
 * Sendloop owns and operates the sending infrastructure. Customers only ever
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

    const [stats, facets] = await Promise.all([
      loadAccountStats(context.supabase, [data.id]),
      loadAccountFacets(context.supabase),
    ]);
    return {
      account: decorate(row, stats[data.id] ?? null),
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

export const requestSendingAccountRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as never as {
      rpc: (fn: string, args: unknown) => Promise<{ error: { message: string } | null }>;
    }).rpc("request_sending_account_release", {
      _account_ids: data.ids,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestEmailAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        quantity: z.number().int().min(1).max(100),
        preferredDomain: z.string().max(200).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createAccountRequest } = await import("@/lib/sending-query");
    return createAccountRequest(context.supabase, context.userId, data);
  });

export const listMyAccountRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAccountRequests } = await import("@/lib/sending-query");
    return loadAccountRequests(context.supabase);
  });
