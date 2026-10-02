/**
 * Warmup worker — QUEUE mode (used only when worker_mode.warmup = "queue").
 *
 * Wraps the EXISTING warmup engine so schedules, ramp, daily/mailbox limits,
 * seed-list recipients, message generation, tracking and confirmation stay in
 * one place (src/lib/warmup-engine.server.ts):
 *
 *  1. Single-flight + pause guard: the SAME `warmup_runner_state` lease as the
 *     legacy runner, so legacy and queue can never run at once.
 *  2. One `warmup_tick` background job per run (key `warmup:<minute>`), skipped
 *     while another tick is open; claimed with claim_background_jobs
 *     (FOR UPDATE SKIP LOCKED) and finished with finish_background_job, which
 *     gives retry with backoff + jitter, `dead` after max attempts, and lease
 *     expiry recovery for a killed run.
 *  3. Inside the tick: the shared scheduler creates due `warmup_jobs`, then
 *     warmup jobs are claimed ONE at a time via the existing claim_warmup_jobs
 *     (FOR UPDATE SKIP LOCKED, status queued -> processing commits before any
 *     SMTP call). Each send runs with no transaction open; its result is
 *     written separately by the existing processJob. Sends are sequential
 *     (concurrency 1), so one mailbox is never sent from twice at once and
 *     shared seed-recipient counters are never raced.
 *  4. Runtime budget: new work (scheduling a mailbox, claiming a send, health
 *     refresh) only STARTS inside WARMUP_RUN_BUDGET_MS; an in-flight send is
 *     never interrupted. Leftover work stays queued for the next tick.
 *  5. Crash safety is at-most-once: a queue-owned warmup job left `processing`
 *     by a killed run is marked failed for review instead of re-sent.
 *  6. worker_health row `warmup`.
 */
import type { RunSummary } from "@/lib/warmup-engine.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const WARMUP_WORKER = "warmup";
export const WARMUP_JOB_MAX_ATTEMPTS = 3;
/** Background runs are killed at ~30s; only start new work before this. */
export const WARMUP_RUN_BUDGET_MS = 20_000;
/** One send at a time (legacy is also sequential): never more SMTP load. */
export const WARMUP_SEND_CONCURRENCY = 1;
/** Prefix on warmup_jobs.locked_by for sends claimed by queue mode. */
export const QUEUE_OWNER_PREFIX = "wq_";
/** A queue run never lives this long, so an older queue-owned claim crashed. */
export const STALE_QUEUE_CLAIM_MS = 2 * 60_000;
export const OUTCOME_UNKNOWN_REASON = "send_outcome_unknown_after_interrupt: held for review, not resent";
const JOB_LEASE_SECONDS = 120;

export type WarmupEngine = {
  acquireLease: (admin: Client, owner: string) => Promise<{ acquired: boolean; paused: boolean; pauseReason: string | null }>;
  releaseLease: (admin: Client, result: RunSummary) => Promise<void>;
  emptySummary: () => RunSummary;
  scheduleWarmupDue: (
    admin: Client,
    summary: RunSummary,
    opts: { shouldStop?: () => boolean; order?: <T>(rows: T[]) => T[] },
  ) => Promise<Array<{ sending_account_id: string }>>;
  processJob: (admin: Client, job: Record<string, unknown>, summary: RunSummary) => Promise<void>;
  sweepPlacement: (admin: Client) => Promise<number>;
  recalculateHealth: (admin: Client, accountId: string) => Promise<unknown>;
  maxJobsPerRun: number;
};

export type WarmupQueueDeps = {
  client: Client;
  now?: () => number;
  budgetMs?: number;
  limit?: number;
  engine?: WarmupEngine;
};

export function warmupJobKey(now: Date): string {
  return `warmup:${now.toISOString().slice(0, 16)}`;
}

/** Rotates the start point each minute so a budget stop never starves the tail. */
export function rotateBy(offset: number) {
  return <T,>(rows: T[]): T[] => {
    if (rows.length < 2) return rows;
    const k = ((offset % rows.length) + rows.length) % rows.length;
    return [...rows.slice(k), ...rows.slice(0, k)];
  };
}

async function loadEngine(): Promise<WarmupEngine> {
  const e = await import("@/lib/warmup-engine.server");
  return {
    acquireLease: e.acquireLease,
    releaseLease: e.releaseLease,
    emptySummary: e.emptySummary,
    scheduleWarmupDue: e.scheduleWarmupDue,
    processJob: e.processJob,
    sweepPlacement: e.sweepPlacement,
    recalculateHealth: e.recalculateHealth,
    maxJobsPerRun: e.MAX_JOBS_PER_RUN,
  };
}

/**
 * At-most-once recovery: queue-owned sends stuck in `processing` (the run was
 * killed mid-send) may already have been accepted by the provider, so they
 * are failed with a clear reason instead of being re-queued and resent.
 */
export async function holdInterruptedQueueSends(client: Client, nowMs: number): Promise<number> {
  const cutoff = new Date(nowMs - STALE_QUEUE_CLAIM_MS).toISOString();
  const { data, error } = await client
    .from("warmup_jobs")
    .update({
      status: "failed",
      locked_by: null,
      locked_at: null,
      error: OUTCOME_UNKNOWN_REASON,
      processed_at: new Date(nowMs).toISOString(),
    })
    .eq("status", "processing")
    .like("locked_by", `${QUEUE_OWNER_PREFIX}%`)
    .lt("locked_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

export async function runWarmupQueue(deps: WarmupQueueDeps) {
  const { client } = deps;
  const nowMs = deps.now ?? (() => Date.now());
  const budgetMs = deps.budgetMs ?? WARMUP_RUN_BUDGET_MS;
  const engine = deps.engine ?? (await loadEngine());
  const startedAtMs = nowMs();
  const startedAt = new Date(startedAtMs);
  const outOfTime = () => nowMs() - startedAtMs >= budgetMs;
  const summary = engine.emptySummary();
  const owner = `${QUEUE_OWNER_PREFIX}${crypto.randomUUID().slice(0, 8)}`;

  const lease = await engine.acquireLease(client, owner);
  if (lease.paused) {
    return { mode: "queue", ...summary, ok: false, skipped: `Runner paused: ${lease.pauseReason ?? "manual"}` };
  }
  if (!lease.acquired) {
    return { mode: "queue", ...summary, ok: false, skipped: "Another warmup run is in progress" };
  }

  let budgetStop = false;
  let held = 0;
  let tickOk = 0;
  let tickFailed = 0;
  let lastError: string | null = null;
  try {
    await writeHealth(client, { status: "running", last_started_at: startedAt.toISOString() });

    // One open tick at a time: a backlog never stacks duplicate ticks.
    const { data: openJobs } = await client
      .from("background_jobs")
      .select("id")
      .eq("worker", WARMUP_WORKER)
      .in("status", ["queued", "running"])
      .limit(1);
    if (!(openJobs ?? []).length) {
      const { error } = await client.from("background_jobs").insert({
        worker: WARMUP_WORKER,
        job_type: "warmup_tick",
        payload: {},
        idempotency_key: warmupJobKey(startedAt),
        max_attempts: WARMUP_JOB_MAX_ATTEMPTS,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
    }

    const { data: ticks, error: claimTickError } = await client.rpc("claim_background_jobs", {
      _worker: WARMUP_WORKER,
      _limit: 1,
      _lease_seconds: JOB_LEASE_SECONDS,
    });
    if (claimTickError) throw new Error(claimTickError.message);
    const tick = ((ticks ?? []) as Array<{ id: string }>)[0];

    if (tick) {
      try {
        held = await holdInterruptedQueueSends(client, nowMs());

        // 1. Scheduler (shared with legacy), budget-aware and rotated.
        const settings = await engine.scheduleWarmupDue(client, summary, {
          shouldStop: () => {
            if (outOfTime()) budgetStop = true;
            return budgetStop;
          },
          order: rotateBy(Math.floor(startedAtMs / 60_000)),
        });

        // 2. Sends: claim one due warmup job at a time, never more than legacy's cap.
        const cap = Math.min(deps.limit ?? engine.maxJobsPerRun, engine.maxJobsPerRun);
        const touched = new Set<string>(settings.map((s) => s.sending_account_id));
        while (summary.claimed < cap) {
          if (outOfTime()) { budgetStop = true; break; }
          const { data: claimed, error: claimError } = await client.rpc("claim_warmup_jobs", {
            _worker: owner,
            _limit: WARMUP_SEND_CONCURRENCY,
          });
          if (claimError) { summary.errors.push(`claim: ${claimError.message}`); break; }
          const jobs = (claimed ?? []) as Array<Record<string, unknown>>;
          if (!jobs.length) break;
          summary.claimed += jobs.length;
          for (const job of jobs) {
            touched.add(job["sending_account_id"] as string);
            try {
              await engine.processJob(client, job, summary);
            } catch (error) {
              summary.errors.push(error instanceof Error ? error.message : "job failed");
            }
          }
        }

        // 3. Placement sweep and 4. health — only while budget remains.
        if (!outOfTime()) {
          try {
            await engine.sweepPlacement(client);
          } catch (error) {
            summary.errors.push(`placement sweep: ${error instanceof Error ? error.message : "failed"}`);
          }
        } else budgetStop = true;
        for (const accountId of touched) {
          if (outOfTime()) { budgetStop = true; break; }
          try {
            await engine.recalculateHealth(client, accountId);
            summary.healthUpdated += 1;
          } catch {
            /* health recalculation is best-effort */
          }
        }

        await client.rpc("finish_background_job", { _id: tick.id, _ok: true });
        tickOk += 1;
      } catch (error) {
        tickFailed += 1;
        lastError = error instanceof Error ? error.message : String(error);
        await client.rpc("finish_background_job", { _id: tick.id, _ok: false, _error: lastError });
      }
    }

    const sendErrors = summary.errors.length;
    await writeHealth(client, {
      status: tickFailed > 0 ? "degraded" : "healthy",
      last_succeeded_at: new Date().toISOString(),
      last_duration_ms: nowMs() - startedAtMs,
      current_jobs: 0,
      ...(tickFailed > 0 || sendErrors > 0
        ? { last_failed_at: new Date().toISOString(), last_error: (lastError ?? summary.errors[0] ?? "").slice(0, 1000) }
        : {}),
    });
    console.log(JSON.stringify({
      worker: "warmup-queue", result: tick ? "ok" : "no_tick", ms: nowMs() - startedAtMs,
      scheduled: summary.scheduled, claimed: summary.claimed, sent: summary.sent, failed: summary.failed, held, budgetStop,
    }));
    return { mode: "queue", ...summary, held, budgetStop, tickOk, tickFailed };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    summary.ok = false;
    summary.errors.push(lastError);
    await writeHealth(client, {
      status: "failed",
      last_failed_at: new Date().toISOString(),
      last_duration_ms: nowMs() - startedAtMs,
      last_error: lastError.slice(0, 1000),
    });
    throw error;
  } finally {
    await engine.releaseLease(client, summary);
  }
}

async function writeHealth(client: Client, patch: Record<string, unknown>) {
  try {
    await client
      .from("worker_health")
      .upsert({ worker: WARMUP_WORKER, ...patch, updated_at: new Date().toISOString() }, { onConflict: "worker" });
  } catch {
    // Health reporting must never break the worker.
  }
}
