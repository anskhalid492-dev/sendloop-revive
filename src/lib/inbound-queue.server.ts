/**
 * Inbound retry — QUEUE mode (used only when worker_mode.inbound = "queue").
 *
 * 1. single-flight lease, 2. enqueue due events with idempotency key
 * `<event id>:<attempt>` (duplicates ignored), 3. claim via
 * claim_background_jobs (SKIP LOCKED), 4. retry each event with the SAME
 * retry/alert code as legacy, 5. finish_background_job, 6. worker_health.
 * email_events.attempts stays the source of truth for inbound backoff.
 */
import { acquireWorkerLease, releaseWorkerLease } from "@/lib/worker-lease.server";
import {
  getInboundOpsSettings,
  retryInboundEventWithAlerts,
  selectDueInboundEvents,
  type InboundOpsSettings,
  type InboundRetryRow,
} from "@/lib/inbound-ops.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const INBOUND_WORKER = "inbound";
export const INBOUND_LEASE_KEY = "worker_lease_inbound";
const LEASE_MS = 4 * 60_000;
const JOB_LEASE_SECONDS = 180;

export type InboundQueueDeps = {
  client: Client;
  getSettings?: () => Promise<InboundOpsSettings>;
  selectDue?: typeof selectDueInboundEvents;
  retry?: (settings: InboundOpsSettings, row: InboundRetryRow) => Promise<unknown>;
};

export async function runInboundRetryQueue(deps: InboundQueueDeps, limit = 25) {
  const { client } = deps;
  const getSettings = deps.getSettings ?? getInboundOpsSettings;
  const selectDue = deps.selectDue ?? selectDueInboundEvents;
  const retry = deps.retry ?? retryInboundEventWithAlerts;
  const startedAt = new Date();

  const settings = await getSettings();
  if (!settings.retryEnabled) return { mode: "queue", disabled: true, enqueued: 0, succeeded: 0, failed: 0 };

  const lease = await acquireWorkerLease(client, INBOUND_LEASE_KEY, LEASE_MS);
  if (!lease) return { mode: "queue", skipped: "lease_held", enqueued: 0, succeeded: 0, failed: 0 };

  let enqueued = 0;
  let succeeded = 0;
  let failed = 0;
  let lastError: string | null = null;
  try {
    await writeHealth(client, { status: "running", last_started_at: startedAt.toISOString() });

    // Enqueue: one insert per event so a duplicate key only skips that row.
    const { due } = await selectDue(settings, limit);
    for (const row of due) {
      const { error } = await client.from("background_jobs").insert({
        worker: INBOUND_WORKER,
        job_type: "inbound_retry",
        payload: { event_id: row.id },
        idempotency_key: `${row.id}:${row.attempts ?? 0}`,
        max_attempts: 3,
      });
      if (!error) enqueued += 1;
      else if (error.code !== "23505") throw new Error(error.message);
    }

    const { data: jobs, error: claimError } = await client.rpc("claim_background_jobs", {
      _worker: INBOUND_WORKER,
      _limit: limit,
      _lease_seconds: JOB_LEASE_SECONDS,
    });
    if (claimError) throw new Error(claimError.message);

    const rowsById = new Map(due.map((row) => [row.id, row]));
    for (const job of (jobs ?? []) as Array<{ id: string; payload: { event_id?: string } }>) {
      const eventId = job.payload?.event_id;
      const row = eventId ? rowsById.get(eventId) ?? (await loadEvent(client, eventId)) : null;
      try {
        if (row) await retry(settings, row); // missing event = nothing left to do
        await client.rpc("finish_background_job", { _id: job.id, _ok: true });
        succeeded += 1;
      } catch (error) {
        failed += 1;
        lastError = error instanceof Error ? error.message : String(error);
        await client.rpc("finish_background_job", { _id: job.id, _ok: false, _error: lastError });
      }
    }

    await writeHealth(client, {
      status: failed > 0 ? "degraded" : "healthy",
      last_succeeded_at: new Date().toISOString(),
      last_duration_ms: Date.now() - startedAt.getTime(),
      current_jobs: 0,
      ...(failed > 0 ? { last_failed_at: new Date().toISOString(), last_error: lastError } : {}),
    });
    return { mode: "queue", enqueued, succeeded, failed };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await writeHealth(client, {
      status: "failed",
      last_failed_at: new Date().toISOString(),
      last_duration_ms: Date.now() - startedAt.getTime(),
      last_error: lastError.slice(0, 1000),
    });
    throw error;
  } finally {
    await releaseWorkerLease(client, lease);
  }
}

async function loadEvent(client: Client, id: string): Promise<InboundRetryRow | null> {
  const { data } = await client
    .from("email_events")
    .select("id, attempts, status, last_retry_at, created_at, failure_code, from_email, subject, workspace_id, conversation_id, lead_id, routing_token")
    .eq("id", id)
    .in("status", ["failed", "retrying", "pending"])
    .maybeSingle();
  return (data as InboundRetryRow | null) ?? null;
}

async function writeHealth(client: Client, patch: Record<string, unknown>) {
  try {
    await client
      .from("worker_health")
      .upsert({ worker: INBOUND_WORKER, ...patch, updated_at: new Date().toISOString() }, { onConflict: "worker" });
  } catch {
    // Health reporting must never break the worker.
  }
}
