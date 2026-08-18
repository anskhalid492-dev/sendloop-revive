/**
 * Customer-facing sending accounts.
 *
 * Sendloop owns and operates the sending infrastructure. Customers can see the
 * accounts assigned to their workspace, their health and capacity, and can
 * pause or resume them — nothing provider-specific is exposed here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WorkspaceSendingAccount = {
  id: string;
  label: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  daily_limit: number;
  hourly_limit: number;
  sent_today: number;
  health_score: number;
  warmup_status: string;
  warmup_daily_target: number;
  customer_enabled: boolean;
  paused: boolean;
  status: "untested" | "verified" | "failed" | "disabled";
  assigned_at: string | null;
  created_at: string;
};

export type SendingAccountSummary = {
  total: number;
  healthy: number;
  warming: number;
  attention: number;
  dailyCapacity: number;
  sentToday: number;
};

const COLUMNS =
  "id, label, from_name, from_email, reply_to, daily_limit, hourly_limit, sent_today, health_score, warmup_status, warmup_daily_target, customer_enabled, paused, status, assigned_at, created_at";

export function accountHealthLabel(account: {
  paused: boolean;
  customer_enabled: boolean;
  status: string;
  health_score: number;
  warmup_status: string;
}): "healthy" | "warming" | "attention" | "paused" {
  if (account.paused || !account.customer_enabled) return "paused";
  if (account.status === "failed" || account.health_score < 70) return "attention";
  if (account.warmup_status === "warming") return "warming";
  return "healthy";
}

export const listMySendingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sending_accounts")
      .select(COLUMNS)
      .not("workspace_id", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const accounts = (data ?? []) as WorkspaceSendingAccount[];
    const summary: SendingAccountSummary = {
      total: accounts.length,
      healthy: accounts.filter((a) => accountHealthLabel(a) === "healthy").length,
      warming: accounts.filter((a) => accountHealthLabel(a) === "warming").length,
      attention: accounts.filter((a) => accountHealthLabel(a) === "attention").length,
      dailyCapacity: accounts.reduce((sum, a) => sum + a.daily_limit, 0),
      sentToday: accounts.reduce((sum, a) => sum + a.sent_today, 0),
    };

    return { accounts, summary };
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
