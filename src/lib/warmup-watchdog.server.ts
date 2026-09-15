/**
 * Warmup watchdog.
 *
 * Two independent safety nets around the warmup dispatcher:
 *
 * 1. `ensureWarmupTick` — the dedicated warmup schedule lives in the database
 *    (`sendloop-warmup-runner`). If that schedule is missing, disabled or its
 *    HTTP call fails, warmup silently stops dispatching while the UI still
 *    reports the mailbox as active. Any other runner endpoint that is firing
 *    can call this to catch up a stale warmup cycle, so warmup never depends on
 *    a single schedule row.
 *
 * 2. `checkStalledWarmupAccounts` — flags mailboxes that have been "warming"
 *    for more than 24 hours with zero sends, so the same silent stall is
 *    visible instead of being noticed by a customer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<any, any, any>;

/** A warmup cycle older than this means the dedicated schedule is not firing. */
export const WARMUP_STALE_MS = 10 * 60 * 1000;
const STALL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WarmupTickResult = {
  ran: boolean;
  reason: string;
  lastRunAt: string | null;
  sent?: number;
  scheduled?: number;
};

/**
 * Runs a warmup cycle only when the dedicated runner has gone quiet. Cheap in
 * the normal case: one row read, then nothing.
 */
export async function ensureWarmupTick(
  admin: Admin,
  options?: { staleMs?: number; limit?: number },
): Promise<WarmupTickResult> {
  const staleMs = options?.staleMs ?? WARMUP_STALE_MS;
  const { data: state, error } = await admin
    .from("warmup_runner_state")
    .select("last_run_at, paused, pause_reason")
    .eq("id", "warmup")
    .maybeSingle();

  if (error) return { ran: false, reason: `state unavailable: ${error.message}`, lastRunAt: null };
  const lastRunAt = (state?.last_run_at as string | null) ?? null;
  if (state?.paused) {
    return { ran: false, reason: `runner paused: ${state.pause_reason ?? "manual"}`, lastRunAt };
  }

  const age = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(age) && age < staleMs) {
    return { ran: false, reason: "recent run", lastRunAt };
  }

  console.warn(
    `warmup watchdog: dispatcher last ran ${lastRunAt ?? "never"} — running a catch-up cycle`,
  );
  const { runWarmupCycle } = await import("@/lib/warmup-engine.server");
  const result = await runWarmupCycle(admin, { limit: options?.limit ?? 25 });
  if (result.errors?.length) {
    console.error("warmup watchdog: catch-up cycle reported errors", result.errors);
  }
  return {
    ran: true,
    reason: "catch-up",
    lastRunAt,
    sent: result.sent,
    scheduled: result.scheduled,
  };
}

export type StalledWarmupAccount = {
  accountId: string;
  workspaceId: string;
  email: string;
  startedAt: string | null;
  hoursWarming: number;
};

/**
 * Flags mailboxes marked as warming for over 24 hours that have never produced
 * a single warmup send. The snapshot is stored so admin tooling and alerting
 * can read it without recomputing.
 */
export async function checkStalledWarmupAccounts(
  admin: Admin,
  options?: { windowMs?: number },
): Promise<{ checked: number; stalled: StalledWarmupAccount[] }> {
  const windowMs = options?.windowMs ?? STALL_WINDOW_MS;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const { data: accounts, error } = await admin
    .from("sending_accounts")
    .select("id, workspace_id, from_email, warmup_started_at")
    .eq("warmup_status", "warming")
    .eq("paused", false)
    .lt("warmup_started_at", cutoff)
    .limit(500);
  if (error) {
    console.error("warmup watchdog: stall check failed", error.message);
    return { checked: 0, stalled: [] };
  }

  const rows = (accounts ?? []) as Array<Record<string, any>>;
  const ids = rows.map((account) => account["id"] as string);

  // One batched read instead of a count query per mailbox: the previous loop
  // issued up to 500 sequential round trips inside a per-minute request, which
  // could outlast the request budget and hang the whole cycle.
  const withSends = new Set<string>();
  const { chunk } = await import("@/lib/supabase-batch");
  for (const idChunk of chunk(ids)) {
    const { data, error: sendsError } = await admin
      .from("warmup_jobs")
      .select("sending_account_id")
      .in("sending_account_id", idChunk)
      .in("status", ["sent", "delivered"])
      .limit(5000);
    if (sendsError) {
      console.error("warmup watchdog: send lookup failed", sendsError.message);
      return { checked: rows.length, stalled: [] };
    }
    for (const row of (data ?? []) as Array<{ sending_account_id: string }>) {
      withSends.add(row.sending_account_id);
    }
  }

  const stalled: StalledWarmupAccount[] = [];
  for (const account of rows) {
    if (withSends.has(account["id"] as string)) continue;
    const startedAt = (account["warmup_started_at"] as string | null) ?? null;
    stalled.push({
      accountId: account["id"] as string,
      workspaceId: account["workspace_id"] as string,
      email: account["from_email"] as string,
      startedAt,
      hoursWarming: startedAt
        ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 3_600_000)
        : 0,
    });
  }

  if (stalled.length > 0) {
    console.error(
      `warmup watchdog: ${stalled.length} mailbox(es) warming over 24h with zero sends: ${stalled
        .map((s) => s.email)
        .join(", ")}`,
    );
  }

  await admin.from("platform_settings").upsert(
    {
      key: "warmup_stall_check",
      value: { checkedAt: new Date().toISOString(), checked: rows.length, stalled },
    },
    { onConflict: "key" },
  );

  return { checked: rows.length, stalled };
}
