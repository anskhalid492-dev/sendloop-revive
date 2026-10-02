/**
 * Campaign worker — QUEUE mode (used only when worker_mode.campaign = "queue").
 *
 * Same architecture as inbound queue mode, wrapped around the EXISTING
 * dispatcher so every sending rule (schedule windows, follow-ups, daily and
 * mailbox limits, campaign/recipient status, suppression, bounces,
 * personalization, tracking) stays in one place:
 *
 *  1. Single-flight: takes the SAME lease as the legacy scheduler
 *     (`campaign_scheduler_lease`), so legacy and queue can never run at once,
 *     even during a mode flip.
 *  2. Enqueue one `campaign_tick` job per sendable campaign that has no open
 *     job yet (idempotency key `campaign:<id>:<minute>` dedupes ticks).
 *  3. Claim small batches via claim_background_jobs (FOR UPDATE SKIP LOCKED),
 *     a short statement that commits before any email is sent.
 *  4. Per job: recover interrupted sends, then runCampaign. Inside, each email
 *     is claimed with its own conditional update (scheduled -> processing) that
 *     commits BEFORE the provider call; the result is written in a separate
 *     short update afterwards. No transaction spans a send.
 *  5. finish_background_job records success, or a failure with exponential
 *     backoff + jitter; after max_attempts the job is `dead` and kept.
 *  6. worker_health row `campaign`.
 *
 * Crash safety is at-most-once: a message left in `processing` with no proof
 * of provider acceptance is marked failed for review instead of being resent.
 */
import { acquireWorkerLease, releaseWorkerLease, logWorkerRun } from "@/lib/worker-lease.server";
import { SCHEDULER_BUDGET_MS, SCHEDULER_LEASE_TTL_MS, hasBudgetRemaining } from "@/lib/campaign-scheduler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const CAMPAIGN_WORKER = "campaign";
/** Shared with the legacy scheduler on purpose: one runner at a time, either mode. */
export const CAMPAIGN_LEASE_KEY = "campaign_scheduler_lease";
export const CAMPAIGN_JOB_MAX_ATTEMPTS = 5;
const JOB_LEASE_SECONDS = 120;
const CLAIM_BATCH = 3;
const STALE_PROCESSING_MINUTES = 10;
/** Reason written on messages whose send outcome is unknown after a crash. */
export const OUTCOME_UNKNOWN_REASON = "send_outcome_unknown_after_interrupt: held for review, not resent";
/** Attempts value that keeps the existing daily retry from ever re-sending it. */
const NEVER_RETRY_ATTEMPTS = 999;

export type CampaignTickResult = { sent: number; failed: number; scheduled: number };

export type CampaignQueueDeps = {
  client: Client;
  now?: () => Date;
  budgetMs?: number;
  runCampaign?: (campaignId: string, now: Date, deadlineAt: Date) => Promise<CampaignTickResult>;
  recover?: (campaignId: string, now: Date) => Promise<number>;
};

export function campaignJobKey(campaignId: string, now: Date): string {
  return `campaign:${campaignId}:${now.toISOString().slice(0, 16)}`;
}

/**
 * Queue-mode recovery for messages an interrupted run left in `processing`.
 * Provider-accepted ones (outbound registry proof) are completed exactly like
 * legacy. The rest are NOT re-queued: the crash may have happened after the
 * provider accepted the email but before the proof was written, so resending
 * could duplicate it. They become `failed` with a clear reason and an attempt
 * count the daily retry never picks up — visible and manually resolvable.
 */
export async function recoverInterruptedForQueue(
  client: Client,
  campaignId: string,
  now: Date = new Date(),
  registryClient?: Client,
): Promise<number> {
  const { completeAcceptedProcessingMessages } = await import("@/lib/dispatch.server");
  let recovered = await completeAcceptedProcessingMessages(client, campaignId, now, registryClient);

  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
  const { data: stuck } = await client
    .from("campaign_messages")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "processing")
    .is("sent_at", null)
    .is("provider_message_id", null)
    .lte("updated_at", cutoff)
    .limit(200);
  const ids = ((stuck ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return recovered;

  const registry = registryClient ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data: proof } = await registry
    .from("outbound_messages")
    .select("ref_id")
    .eq("ref_table", "campaign_messages")
    .in("ref_id", ids);
  const accepted = new Set(((proof ?? []) as { ref_id: string | null }[]).map((r) => r.ref_id));
  const unknown = ids.filter((id) => !accepted.has(id));
  if (!unknown.length) return recovered;

  await client
    .from("campaign_messages")
    .update({ status: "failed", last_error: OUTCOME_UNKNOWN_REASON, attempts: NEVER_RETRY_ATTEMPTS })
    .in("id", unknown)
    .eq("status", "processing")
    .is("sent_at", null)
    .is("provider_message_id", null);
  recovered += unknown.length;
  return recovered;
}

export async function runCampaignQueue(deps: CampaignQueueDeps, campaigns: Array<{ id: string }>) {
  const { client } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const budgetMs = deps.budgetMs ?? SCHEDULER_BUDGET_MS;
  const startedAt = nowFn();
  const startedAtMs = startedAt.getTime();
  const deadlineAt = new Date(startedAtMs + budgetMs);

  const runOne =
    deps.runCampaign ??
    (async (campaignId: string, now: Date, deadline: Date) => {
      const { runCampaign } = await import("@/lib/dispatch.server");
      return runCampaign(client, { campaignId, limit: 25, now, deadlineAt: deadline });
    });
  const recover = deps.recover ?? ((id: string, now: Date) => recoverInterruptedForQueue(client, id, now));

  const lease = await acquireWorkerLease(client, CAMPAIGN_LEASE_KEY, SCHEDULER_LEASE_TTL_MS, startedAt);
  if (!lease) {
    logWorkerRun({ worker: "campaign-queue", startedAt: startedAtMs, result: "skipped", reason: "locked" });
    return { mode: "queue", skipped: "lease_held", enqueued: 0, succeeded: 0, failed: 0, sent: 0 };
  }

  let enqueued = 0;
  let succeeded = 0;
  let failed = 0;
  let sent = 0;
  let lastError: string | null = null;
  try {
    await writeHealth(client, { status: "running", last_started_at: startedAt.toISOString() });

    // Enqueue only campaigns without an open job, so a backlog never piles up
    // duplicate ticks for the same campaign.
    const ids = campaigns.map((c) => c.id);
    const open = new Set<string>();
    if (ids.length) {
      const { data: openJobs } = await client
        .from("background_jobs")
        .select("payload")
        .eq("worker", CAMPAIGN_WORKER)
        .in("status", ["queued", "running"])
        .limit(500);
      for (const j of (openJobs ?? []) as Array<{ payload: { campaign_id?: string } }>) {
        if (j.payload?.campaign_id) open.add(j.payload.campaign_id);
      }
    }
    for (const id of ids) {
      if (open.has(id)) continue;
      const { error } = await client.from("background_jobs").insert({
        worker: CAMPAIGN_WORKER,
        job_type: "campaign_tick",
        payload: { campaign_id: id },
        idempotency_key: campaignJobKey(id, startedAt),
        max_attempts: CAMPAIGN_JOB_MAX_ATTEMPTS,
      });
      if (!error) enqueued += 1;
      else if (error.code !== "23505") throw new Error(error.message);
    }

    // Small batches while budget remains; unclaimed jobs wait for the next tick.
    while (hasBudgetRemaining(startedAtMs, nowFn().getTime(), budgetMs)) {
      const { data: jobs, error: claimError } = await client.rpc("claim_background_jobs", {
        _worker: CAMPAIGN_WORKER,
        _limit: CLAIM_BATCH,
        _lease_seconds: JOB_LEASE_SECONDS,
      });
      if (claimError) throw new Error(claimError.message);
      const batch = (jobs ?? []) as Array<{ id: string; payload: { campaign_id?: string } }>;
      if (!batch.length) break;
      for (const job of batch) {
        const campaignId = job.payload?.campaign_id;
        try {
          if (campaignId) {
            await recover(campaignId, nowFn());
            const result = await runOne(campaignId, nowFn(), deadlineAt);
            sent += result.sent;
          }
          await client.rpc("finish_background_job", { _id: job.id, _ok: true });
          succeeded += 1;
        } catch (error) {
          failed += 1;
          lastError = error instanceof Error ? error.message : String(error);
          await client.rpc("finish_background_job", { _id: job.id, _ok: false, _error: lastError });
        }
      }
    }

    await writeHealth(client, {
      status: failed > 0 ? "degraded" : "healthy",
      last_succeeded_at: new Date().toISOString(),
      last_duration_ms: Date.now() - startedAtMs,
      current_jobs: 0,
      ...(failed > 0 ? { last_failed_at: new Date().toISOString(), last_error: lastError?.slice(0, 1000) } : {}),
    });
    logWorkerRun({ worker: "campaign-queue", startedAt: startedAtMs, result: "ok", enqueued, succeeded, failed, sent });
    return { mode: "queue", enqueued, succeeded, failed, sent };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await writeHealth(client, {
      status: "failed",
      last_failed_at: new Date().toISOString(),
      last_duration_ms: Date.now() - startedAtMs,
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
      .upsert({ worker: CAMPAIGN_WORKER, ...patch, updated_at: new Date().toISOString() }, { onConflict: "worker" });
  } catch {
    // Health reporting must never break the worker.
  }
}
