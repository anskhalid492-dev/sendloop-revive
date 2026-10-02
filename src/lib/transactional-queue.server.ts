/**
 * Transactional (system) email worker — QUEUE mode.
 * Used only when platform_settings.worker_mode.transactional = "queue".
 *
 * Wraps the EXISTING transactional engine (src/lib/transactional-email.server.ts):
 * templates, sender identities, provider selection and the Resend adapter are
 * reused unchanged; only the run loop and crash handling differ.
 *
 *  1. Single-flight: the SAME `transactional_runner_lease` as legacy, so the
 *     two paths never run at once.
 *  2. One `transactional_tick` background job per run (key
 *     `transactional:<minute>`), skipped while another tick is open; claimed
 *     with claim_background_jobs and finished with finish_background_job
 *     (retry + backoff + jitter, `dead` after max attempts, lease recovery).
 *  3. Per email: atomic claim (queued|retrying -> sending, marker CLAIMED),
 *     then a second short write (marker PROVIDER_CALL) BEFORE the provider is
 *     contacted. If that write fails, the provider is never called and the
 *     row is released. No DB transaction is open during the Resend request.
 *  4. Bounded: new sends only START inside TX_RUN_BUDGET_MS; an in-flight send
 *     is never interrupted. Untouched rows stay queued for the next minute.
 *  5. Crash safety is at-most-once:
 *       - sending + CLAIMED older than STALE_SENDING_MS  -> provider was never
 *         called -> safely back to `retrying`.
 *       - any other stale `sending` (PROVIDER_CALL, legacy rows, unknown) ->
 *         `outcome_unknown`: visible in the email log, never resent
 *         automatically, never marked sent.
 *       - transport failure / timeout with no HTTP status after the provider
 *         was called -> `outcome_unknown` (Resend may have accepted it).
 *       - HTTP rejection from the provider -> normal retry/backoff/failed.
 *  6. Provider recovery: a system provider marked `down` is re-probed with the
 *     existing non-sending credential check at most once per
 *     PROVIDER_RECHECK_MS, so a stale down state clears on its own.
 *  7. worker_health row `transactional`.
 */
import type { DeliverRow, TransactionalSettings } from "@/lib/transactional-email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const TRANSACTIONAL_WORKER = "transactional";
/** New sends only start in this window; Resend's own timeout bounds in-flight sends. */
export const TX_RUN_BUDGET_MS = 6_000;
export const TX_SEND_CONCURRENCY = 3;
export const TX_JOB_MAX_ATTEMPTS = 3;
export const TX_LEASE_MS = 60_000;
const JOB_LEASE_SECONDS = 90;
/** Far longer than any run (legacy lease is 4 min), so an older `sending` row is abandoned. */
export const STALE_SENDING_MS = 10 * 60_000;
export const PROVIDER_RECHECK_MS = 15 * 60_000;

export const MARK_CLAIMED = "in_progress:claimed";
export const MARK_PROVIDER_CALL = "in_progress:provider_call";
export const OUTCOME_UNKNOWN_STATUS = "outcome_unknown";
export const OUTCOME_UNKNOWN_REASON =
  "Send outcome unknown (run interrupted or provider unreachable after the request was made). Held for review — not resent automatically. Check the provider log before resending.";

export type DeliverOutcome = {
  ok: boolean;
  provider: string | null;
  messageId?: string | null;
  statusCode?: number | null;
  error?: string | null;
};

export type TransactionalEngine = {
  getSettings: (admin: Client) => Promise<TransactionalSettings>;
  deliver: (
    admin: Client,
    row: DeliverRow,
    settings: TransactionalSettings,
    hooks: { beforeProviderCall?: () => Promise<void> },
  ) => Promise<DeliverOutcome>;
  acquireLease: (admin: Client, ttlMs: number) => Promise<unknown | null>;
  releaseLease: (admin: Client, lease: unknown) => Promise<void>;
  registerOutbound: (admin: Client, row: { id: string; to_email: string }, outcome: DeliverOutcome) => Promise<void>;
  recoverProviders: (admin: Client, nowMs: number) => Promise<number>;
};

export type TransactionalQueueDeps = {
  client: Client;
  now?: () => number;
  budgetMs?: number;
  limit?: number;
  engine?: TransactionalEngine;
  random?: () => number;
};

export function transactionalJobKey(now: Date): string {
  return `transactional:${now.toISOString().slice(0, 16)}`;
}

/** Exponential backoff with ±20% jitter — same formula as legacy. */
export function retryDelayMs(baseSeconds: number, attempt: number, random: () => number = Math.random): number {
  return baseSeconds * Math.pow(2, Math.max(0, attempt - 1)) * (0.8 + random() * 0.4) * 1000;
}

/**
 * True when the provider may have accepted the message: it was contacted and
 * then no HTTP answer came back (timeout / network drop).
 */
export function isUnknownOutcome(outcome: DeliverOutcome, providerCalled: boolean): boolean {
  if (outcome.ok || !providerCalled) return false;
  if (typeof outcome.statusCode === "number") return false;
  return /could not reach the provider|timeout|timed out|aborted|network|fetch failed|ECONNRESET/i.test(
    outcome.error ?? "",
  );
}

async function loadEngine(): Promise<TransactionalEngine> {
  const tx = await import("@/lib/transactional-email.server");
  const leases = await import("@/lib/worker-lease.server");
  return {
    getSettings: tx.getTransactionalSettings,
    deliver: tx.deliverTransactional as TransactionalEngine["deliver"],
    acquireLease: (admin, ttl) => leases.acquireWorkerLease(admin, tx.TRANSACTIONAL_LEASE_KEY, ttl),
    releaseLease: (admin, lease) => leases.releaseWorkerLease(admin, lease as never),
    registerOutbound: async (admin, row, outcome) => {
      const { registerOutboundMessage } = await import("@/lib/message-classification.server");
      await registerOutboundMessage(
        {
          providerMessageId: outcome.messageId ?? null,
          messageType: "transactional",
          provider: outcome.provider,
          toEmail: row.to_email,
          refTable: "transactional_emails",
          refId: row.id,
        },
        admin,
      );
    },
    recoverProviders: recoverDownSystemProviders,
  };
}

/**
 * Re-probes system-scope providers that are marked down with the existing
 * read-only credential check (Resend: GET /domains — never sends). Throttled
 * per provider by last_tested_at so it cannot spam the provider.
 */
export async function recoverDownSystemProviders(admin: Client, nowMs: number): Promise<number> {
  const { loadPool, checkProviderHealth, logRoutingEvent } = await import("@/lib/provider-pool.server");
  const { isProviderEnabledForScope } = await import("@/lib/email-provider-scope");
  const pool = await loadPool(admin);
  let checked = 0;
  for (const row of pool) {
    if (!shouldRecheckProvider(row, nowMs, isProviderEnabledForScope)) continue;
    const probe = await checkProviderHealth(admin, row);
    checked += 1;
    try {
      await logRoutingEvent(admin, {
        providerId: row.id,
        event: "health_check",
        reason: probe.health,
        detail: `auto-recheck (transactional queue): ${probe.reason}`,
      });
    } catch {
      /* audit is best-effort */
    }
  }
  return checked;
}

export function shouldRecheckProvider(
  row: { health_status: string | null; last_tested_at?: string | null; health_checked_at?: string | null },
  nowMs: number,
  enabledForSystem: (row: never, scope: "system") => boolean,
): boolean {
  if (row.health_status !== "down") return false;
  if (!enabledForSystem(row as never, "system")) return false;
  const last = Date.parse(row.last_tested_at ?? row.health_checked_at ?? "") || 0;
  return nowMs - last >= PROVIDER_RECHECK_MS;
}

/** Resolves abandoned `sending` rows without ever resending a possibly-accepted email. */
export async function recoverStaleSending(client: Client, nowMs: number): Promise<{ requeued: number; held: number }> {
  const cutoff = new Date(nowMs - STALE_SENDING_MS).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  // Provider never contacted -> safe to retry.
  const { data: requeued, error: e1 } = await client
    .from("transactional_emails")
    .update({ status: "retrying", error: "Recovered after interrupted run (provider was not contacted).", next_attempt_at: nowIso })
    .eq("status", "sending")
    .eq("error", MARK_CLAIMED)
    .lt("updated_at", cutoff)
    .select("id");
  if (e1) throw new Error(e1.message);
  // Everything else may have reached the provider -> hold for review.
  const { data: held, error: e2 } = await client
    .from("transactional_emails")
    .update({ status: OUTCOME_UNKNOWN_STATUS, error: OUTCOME_UNKNOWN_REASON, failed_at: nowIso })
    .eq("status", "sending")
    .lt("updated_at", cutoff)
    .select("id");
  if (e2) throw new Error(e2.message);
  return { requeued: (requeued ?? []).length, held: (held ?? []).length };
}

type PendingRow = DeliverRow & { attempts: number; max_attempts: number };

export type TxQueueSummary = {
  mode: "queue";
  ok: boolean;
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  unknown: number;
  requeuedStale: number;
  heldStale: number;
  providersRechecked: number;
  deferred: number;
  budgetStop: boolean;
  skipped?: string;
  errors: string[];
};

async function updateWithRetry(client: Client, id: string, patch: Record<string, unknown>, tries = 3): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const { data, error } = await client
        .from("transactional_emails")
        .update(patch)
        .eq("id", id)
        .eq("status", "sending")
        .select("id");
      if (!error && (data ?? []).length > 0) return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

export async function runTransactionalQueue(deps: TransactionalQueueDeps): Promise<TxQueueSummary> {
  const { client } = deps;
  const nowMs = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  const budgetMs = deps.budgetMs ?? TX_RUN_BUDGET_MS;
  const engine = deps.engine ?? (await loadEngine());
  const startedAtMs = nowMs();
  const outOfTime = () => nowMs() - startedAtMs >= budgetMs;
  const summary: TxQueueSummary = {
    mode: "queue", ok: true, claimed: 0, sent: 0, failed: 0, retried: 0, unknown: 0,
    requeuedStale: 0, heldStale: 0, providersRechecked: 0, deferred: 0, budgetStop: false, errors: [],
  };

  const settings = await engine.getSettings(client);
  if (settings.paused) return { ...summary, ok: false, skipped: `Paused: ${settings.pause_reason ?? "manual"}` };
  if (!settings.enabled) return { ...summary, ok: false, skipped: "Transactional email disabled" };

  const lease = await engine.acquireLease(client, TX_LEASE_MS);
  if (!lease) return { ...summary, skipped: "Another run is in progress" };

  let tickFailed = false;
  let lastError: string | null = null;
  try {
    await writeHealth(client, { status: "running", last_started_at: new Date(startedAtMs).toISOString() });

    const { data: openJobs } = await client
      .from("background_jobs")
      .select("id")
      .eq("worker", TRANSACTIONAL_WORKER)
      .in("status", ["queued", "running"])
      .limit(1);
    if (!(openJobs ?? []).length) {
      const { error } = await client.from("background_jobs").insert({
        worker: TRANSACTIONAL_WORKER,
        job_type: "transactional_tick",
        payload: {},
        idempotency_key: transactionalJobKey(new Date(startedAtMs)),
        max_attempts: TX_JOB_MAX_ATTEMPTS,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
    }

    const { data: ticks, error: claimTickError } = await client.rpc("claim_background_jobs", {
      _worker: TRANSACTIONAL_WORKER,
      _limit: 1,
      _lease_seconds: JOB_LEASE_SECONDS,
    });
    if (claimTickError) throw new Error(claimTickError.message);
    const tick = ((ticks ?? []) as Array<{ id: string }>)[0];

    if (tick) {
      try {
        const stale = await recoverStaleSending(client, nowMs());
        summary.requeuedStale = stale.requeued;
        summary.heldStale = stale.held;

        try {
          summary.providersRechecked = await engine.recoverProviders(client, nowMs());
        } catch (error) {
          summary.errors.push(`provider recheck: ${error instanceof Error ? error.message : "failed"}`);
        }

        const limit = Math.min(Math.max(1, deps.limit ?? settings.batch_size), 100);
        const { data: pendingData, error: pendingError } = await client
          .from("transactional_emails")
          .select("id, to_email, from_email, reply_to, subject, html, text_body, attempts, max_attempts")
          .in("status", ["queued", "retrying"])
          .lte("next_attempt_at", new Date(nowMs()).toISOString())
          .order("queued_at", { ascending: true })
          .limit(limit);
        if (pendingError) throw new Error(pendingError.message);
        const pending = [...((pendingData ?? []) as PendingRow[])];

        const worker = async () => {
          while (pending.length) {
            if (outOfTime()) { summary.budgetStop = true; return; }
            const row = pending.shift()!;
            try {
              await processOne(client, engine, settings, row, summary, nowMs, random);
            } catch (error) {
              summary.errors.push(`${row.id}: ${error instanceof Error ? error.message : "failed"}`.slice(0, 300));
            }
          }
        };
        await Promise.all(Array.from({ length: TX_SEND_CONCURRENCY }, worker));
        summary.deferred = pending.length;

        await client.rpc("finish_background_job", { _id: tick.id, _ok: true });
      } catch (error) {
        tickFailed = true;
        lastError = error instanceof Error ? error.message : String(error);
        summary.ok = false;
        summary.errors.push(lastError);
        await client.rpc("finish_background_job", { _id: tick.id, _ok: false, _error: lastError.slice(0, 1000) });
      }
    }

    await writeHealth(client, {
      status: tickFailed ? "degraded" : "healthy",
      last_succeeded_at: new Date(nowMs()).toISOString(),
      last_duration_ms: nowMs() - startedAtMs,
      current_jobs: 0,
      ...(tickFailed || summary.errors.length
        ? { last_failed_at: new Date(nowMs()).toISOString(), last_error: (lastError ?? summary.errors[0] ?? "").slice(0, 1000) }
        : {}),
    });
    console.log(JSON.stringify({
      worker: "transactional-queue", result: tick ? "ok" : "no_tick", ms: nowMs() - startedAtMs,
      claimed: summary.claimed, sent: summary.sent, retried: summary.retried, failed: summary.failed,
      unknown: summary.unknown, heldStale: summary.heldStale, deferred: summary.deferred, budgetStop: summary.budgetStop,
    }));
    return summary;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await writeHealth(client, {
      status: "failed",
      last_failed_at: new Date(nowMs()).toISOString(),
      last_duration_ms: nowMs() - startedAtMs,
      last_error: lastError.slice(0, 1000),
    });
    throw error;
  } finally {
    await engine.releaseLease(client, lease);
  }
}

async function processOne(
  client: Client,
  engine: TransactionalEngine,
  settings: TransactionalSettings,
  row: PendingRow,
  summary: TxQueueSummary,
  nowMs: () => number,
  random: () => number,
) {
  const attempt = row.attempts + 1;
  // 1. Atomic claim — only one worker can move the row out of queued/retrying.
  const { data: claimed } = await client
    .from("transactional_emails")
    .update({ status: "sending", attempts: attempt, error: MARK_CLAIMED, updated_at: new Date(nowMs()).toISOString() })
    .eq("id", row.id)
    .in("status", ["queued", "retrying"])
    .select("id")
    .maybeSingle();
  if (!claimed) return;
  summary.claimed += 1;

  // 2. Record "provider may be contacted" BEFORE contacting it; refuse to send otherwise.
  let providerCalled = false;
  const beforeProviderCall = async () => {
    const { data, error } = await client
      .from("transactional_emails")
      .update({ error: MARK_PROVIDER_CALL, updated_at: new Date(nowMs()).toISOString() })
      .eq("id", row.id)
      .eq("status", "sending")
      .select("id");
    if (error || !(data ?? []).length) throw new PreCallAbort("could not record send start; provider not contacted");
    providerCalled = true;
  };

  let outcome: DeliverOutcome;
  try {
    outcome = await engine.deliver(client, row, settings, { beforeProviderCall });
  } catch (error) {
    outcome = { ok: false, provider: null, error: error instanceof Error ? error.message : "Send failed" };
    if (providerCalled && !(error instanceof PreCallAbort)) {
      // Threw after the request may have left: treat as unknown, never resend.
      outcome = { ...outcome, error: `Could not reach the provider: ${outcome.error}` };
    }
  }

  if (outcome.ok) {
    summary.sent += 1;
    const saved = await updateWithRetry(client, row.id, {
      status: "sent",
      provider: outcome.provider,
      provider_message_id: outcome.messageId ?? null,
      provider_status_code: outcome.statusCode ?? null,
      error: null,
      sent_at: new Date(nowMs()).toISOString(),
    });
    if (!saved) {
      // The provider accepted it. Leave the PROVIDER_CALL marker so recovery
      // holds it as outcome_unknown — never requeued, never resent.
      summary.errors.push(`${row.id}: sent (provider id ${outcome.messageId ?? "n/a"}) but status update failed`);
      console.error(JSON.stringify({ worker: "transactional-queue", event: "sent_update_failed", id: row.id, providerMessageId: outcome.messageId ?? null }));
    }
    try {
      await engine.registerOutbound(client, row, outcome);
    } catch {
      /* classification registry is best-effort, exactly as legacy */
    }
    return;
  }

  const message = (outcome.error ?? "Send failed").slice(0, 1000);
  if (isUnknownOutcome(outcome, providerCalled)) {
    summary.unknown += 1;
    summary.errors.push(`${row.id}: outcome unknown`);
    await updateWithRetry(client, row.id, {
      status: OUTCOME_UNKNOWN_STATUS,
      provider: outcome.provider,
      error: `${OUTCOME_UNKNOWN_REASON} Provider said: ${message}`.slice(0, 1000),
      failed_at: new Date(nowMs()).toISOString(),
    });
    return;
  }

  summary.errors.push(`${row.id}: ${message}`.slice(0, 300));
  if (attempt < Math.max(1, row.max_attempts)) {
    summary.retried += 1;
    await updateWithRetry(client, row.id, {
      status: "retrying",
      provider: outcome.provider,
      error: message,
      next_attempt_at: new Date(nowMs() + retryDelayMs(settings.retry_delay_seconds, attempt, random)).toISOString(),
    });
  } else {
    summary.failed += 1;
    await updateWithRetry(client, row.id, {
      status: "failed",
      provider: outcome.provider,
      error: message,
      failed_at: new Date(nowMs()).toISOString(),
    });
  }
}

class PreCallAbort extends Error {}

async function writeHealth(client: Client, patch: Record<string, unknown>) {
  try {
    await client
      .from("worker_health")
      .upsert({ worker: TRANSACTIONAL_WORKER, ...patch, updated_at: new Date().toISOString() }, { onConflict: "worker" });
  } catch {
    // Health reporting must never break the worker.
  }
}
