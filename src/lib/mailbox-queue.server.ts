/**
 * Mailbox poll worker — QUEUE mode (used only when worker_mode.mailbox = "queue").
 *
 * Same architecture as inbound/campaign queue mode, wrapped around the EXISTING
 * per-mailbox reader (`pollMailbox`) so IMAP reading, reply/bounce/warmup
 * handling, Unified Inbox filing, cursors and status handling stay in one place:
 *
 *  1. Single-flight: takes the SAME lease as the legacy poller
 *     (`mailbox_poll_lease`), so legacy and queue can never run at once.
 *  2. Selects the same mailboxes legacy would (connected, active, rotation by
 *     last_tested_at, same cap) and enqueues one `mailbox_poll` job per mailbox
 *     that has no open job. Key `mailbox:<id>:<minute>` rejects duplicates.
 *  3. Claims small batches via claim_background_jobs (FOR UPDATE SKIP LOCKED).
 *     The claim is one short statement that commits before any IMAP call; a
 *     claimed job is invisible to every other claimer until its lease expires.
 *  4. Per job: re-read the mailbox (honours disconnects since enqueue), poll it
 *     over the network with no transaction open, then finish_background_job in
 *     a separate short call.
 *  5. Failure → exponential backoff + jitter; `dead` after max_attempts (kept).
 *     A run never claims more jobs than were due when it started, so retries
 *     wait for a later tick and workload never exceeds legacy.
 *  6. worker_health row `mailbox`.
 */
import { acquireWorkerLease, releaseWorkerLease, logWorkerRun } from "@/lib/worker-lease.server";
import type { MailboxPollOutcome, PollMailboxRow } from "@/lib/mailbox-imap-poll.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const MAILBOX_WORKER = "mailbox";
export const MAILBOX_LEASE_KEY = "mailbox_poll_lease";
export const MAILBOX_LEASE_MS = 10 * 60_000;
export const MAILBOX_JOB_MAX_ATTEMPTS = 3;
const MAILBOX_LIMIT = 100;
/** Same as legacy POLL_CONCURRENCY: simultaneous IMAP connections per run. */
const CLAIM_BATCH = 4;
/** Longer than any single mailbox read; an expired lease makes the job reclaimable. */
const JOB_LEASE_SECONDS = 300;
/** Stop claiming well inside the run lease. */
const RUN_BUDGET_MS = 8 * 60_000;

export type MailboxQueueDeps = {
  client: Client;
  now?: () => number;
  budgetMs?: number;
  limit?: number;
  loadMailboxes?: (limit: number, ids?: string[]) => Promise<PollMailboxRow[]>;
  poll?: (row: PollMailboxRow) => Promise<MailboxPollOutcome>;
};

export function mailboxJobKey(mailboxId: string, now: Date): string {
  return `mailbox:${mailboxId}:${now.toISOString().slice(0, 16)}`;
}

export async function runMailboxQueue(deps: MailboxQueueDeps) {
  const { client } = deps;
  const nowMs = deps.now ?? (() => Date.now());
  const budgetMs = deps.budgetMs ?? RUN_BUDGET_MS;
  const limit = deps.limit ?? MAILBOX_LIMIT;
  const startedAtMs = nowMs();
  const startedAt = new Date(startedAtMs);

  const load =
    deps.loadMailboxes ??
    (async (l: number, ids?: string[]) => {
      const { loadPollableMailboxes } = await import("@/lib/mailbox-imap-poll.server");
      return loadPollableMailboxes(client, l, ids);
    });
  const poll =
    deps.poll ??
    (async (row: PollMailboxRow) => {
      const { pollMailbox } = await import("@/lib/mailbox-imap-poll.server");
      return pollMailbox(client, row);
    });

  const lease = await acquireWorkerLease(client, MAILBOX_LEASE_KEY, MAILBOX_LEASE_MS, startedAt);
  if (!lease) {
    logWorkerRun({ worker: "mailbox-queue", startedAt: startedAtMs, result: "skipped", reason: "locked" });
    return { mode: "queue", skipped: "lease_held", enqueued: 0, succeeded: 0, failed: 0, replies: 0, bounces: 0, warmup: 0 };
  }

  let enqueued = 0;
  let succeeded = 0;
  let failed = 0;
  let replies = 0;
  let bounces = 0;
  let warmup = 0;
  let lastError: string | null = null;
  try {
    await writeHealth(client, { status: "running", last_started_at: startedAt.toISOString() });

    const rows = await load(limit);
    const open = new Set<string>();
    if (rows.length) {
      const { data: openJobs } = await client
        .from("background_jobs")
        .select("payload")
        .eq("worker", MAILBOX_WORKER)
        .in("status", ["queued", "running"])
        .limit(1000);
      for (const j of (openJobs ?? []) as Array<{ payload: { mailbox_id?: string } }>) {
        if (j.payload?.mailbox_id) open.add(j.payload.mailbox_id);
      }
    }
    for (const row of rows) {
      if (open.has(row.id)) continue;
      const { error } = await client.from("background_jobs").insert({
        worker: MAILBOX_WORKER,
        job_type: "mailbox_poll",
        payload: { mailbox_id: row.id },
        idempotency_key: mailboxJobKey(row.id, startedAt),
        max_attempts: MAILBOX_JOB_MAX_ATTEMPTS,
      });
      if (!error) enqueued += 1;
      else if (error.code !== "23505") throw new Error(error.message);
    }

    // Never claim more than this run's selection: a job failing mid-run waits
    // out its backoff for a later tick instead of adding IMAP load now.
    let claimBudget = rows.length;
    const seen = new Set<string>();
    while (claimBudget > 0 && nowMs() - startedAtMs < budgetMs) {
      const { data: jobs, error: claimError } = await client.rpc("claim_background_jobs", {
        _worker: MAILBOX_WORKER,
        _limit: Math.min(CLAIM_BATCH, claimBudget),
        _lease_seconds: JOB_LEASE_SECONDS,
      });
      if (claimError) throw new Error(claimError.message);
      const batch = (jobs ?? []) as Array<{ id: string; payload: { mailbox_id?: string } }>;
      if (!batch.length) break;
      claimBudget -= batch.length;

      await Promise.all(
        batch.map(async (job) => {
          const mailboxId = job.payload?.mailbox_id;
          try {
            if (mailboxId && !seen.has(mailboxId)) {
              seen.add(mailboxId);
              // Re-read: a mailbox disconnected/deactivated since enqueue is skipped.
              const [row] = await load(1, [mailboxId]);
              if (row) {
                const outcome = await poll(row);
                replies += outcome.replies;
                bounces += outcome.bounces;
                warmup += outcome.warmup;
                if (!outcome.ok) throw new Error(outcome.error ?? "Mailbox check failed");
              }
            }
            await client.rpc("finish_background_job", { _id: job.id, _ok: true });
            succeeded += 1;
          } catch (error) {
            failed += 1;
            lastError = error instanceof Error ? error.message : String(error);
            await client.rpc("finish_background_job", { _id: job.id, _ok: false, _error: lastError });
          }
        }),
      );
    }

    await writeHealth(client, {
      // A single mailbox with bad credentials is the customer's problem, not a
      // worker fault: the worker stays healthy while any mailbox succeeds.
      status: failed > 0 && succeeded === 0 ? "degraded" : "healthy",
      last_succeeded_at: new Date().toISOString(),
      last_duration_ms: nowMs() - startedAtMs,
      current_jobs: 0,
      ...(failed > 0 ? { last_failed_at: new Date().toISOString(), last_error: lastError?.slice(0, 1000) } : {}),
    });
    logWorkerRun({ worker: "mailbox-queue", startedAt: startedAtMs, result: "ok", enqueued, succeeded, failed, replies, bounces });
    return { mode: "queue", enqueued, succeeded, failed, replies, bounces, warmup };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await writeHealth(client, {
      status: "failed",
      last_failed_at: new Date().toISOString(),
      last_duration_ms: nowMs() - startedAtMs,
      last_error: lastError.slice(0, 1000),
    });
    throw error;
  } finally {
    await releaseWorkerLease(client, lease);
  }
}

async function writeHealth(client: Client, patch: Record<string, unknown>) {
  try {
    await client
      .from("worker_health")
      .upsert({ worker: MAILBOX_WORKER, ...patch, updated_at: new Date().toISOString() }, { onConflict: "worker" });
  } catch {
    // Health reporting must never break the worker.
  }
}
