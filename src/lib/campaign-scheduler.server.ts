/**
 * Campaign scheduler orchestration.
 *
 * pg_cron -> run_campaign_scheduler() -> POST /api/public/cron/run-campaigns
 * used to run every active campaign inline, so a busy queue blew past the HTTP
 * request timeout: the caller saw a timeout while the runtime kept sending.
 * This module makes the invocation bounded and resumable instead:
 *
 *  - a lease in `platform_settings` prevents overlapping invocations (and
 *    therefore double sends),
 *  - each invocation works inside a wall-clock budget and stops cleanly,
 *  - a cursor records where it stopped so the next invocation continues,
 *  - messages left mid-flight by an interrupted invocation are recovered:
 *    provider-accepted ones are completed, the rest are re-queued.
 */
import {
  SCHEDULER_BUDGET_MS,
  SCHEDULER_LEASE_TTL_MS,
  hasBudgetRemaining,
  orderCampaignsForRun,
} from "./campaign-scheduler";
import { completeAcceptedProcessingMessages } from "./dispatch.server";

type AnySupabase = any;

const LEASE_KEY = "campaign_scheduler_lease";
const CURSOR_KEY = "campaign_scheduler_cursor";
/** Minutes a message may sit in `processing` before recovery kicks in. */
const STALE_PROCESSING_MINUTES = 10;

export type SchedulerCampaign = { id: string; name?: string | null };

export type SchedulerRunResult = {
  ok: boolean;
  skipped?: "locked";
  campaigns: number;
  processed: number;
  budgetExhausted: boolean;
  recovered: number;
  results: Array<{ id: string; sent: number; failed: number; scheduled: number }>;
};

export type SchedulerDeps = {
  now?: () => Date;
  budgetMs?: number;
  leaseTtlMs?: number;
  /** Runs one campaign; defaults to the real dispatcher. */
  runCampaign?: (campaignId: string, now: Date) => Promise<{ sent: number; failed: number; scheduled: number }>;
  /** Recovers interrupted in-flight messages; defaults to the real recovery. */
  recover?: (campaignId: string, now: Date) => Promise<number>;
  perCampaignLimit?: number;
};

async function readSetting(supabase: AnySupabase, key: string): Promise<any> {
  const { data } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function writeSetting(supabase: AnySupabase, key: string, value: unknown): Promise<void> {
  await supabase.from("platform_settings").upsert({ key, value }, { onConflict: "key" });
}

/**
 * Recovers messages an interrupted invocation left in `processing`:
 * provider-accepted rows are completed from the outbound registry; rows proven
 * never handed to the provider are re-queued; rows whose provider call may have
 * happened are held as outcome-unknown. Nothing possibly accepted is re-sent.
 */
export async function recoverInterruptedMessages(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
): Promise<number> {
  const recovered = await completeAcceptedProcessingMessages(supabase, campaignId, now);
  const { recoverUnprovenProcessing } = await import("./campaign-queue.server");
  return recovered + (await recoverUnprovenProcessing(supabase, campaignId, now));
}

/**
 * Runs one bounded scheduler invocation. Always returns quickly enough for the
 * cron HTTP request to succeed; leftover work is picked up next invocation.
 */
export async function runCampaignScheduler(
  supabase: AnySupabase,
  campaigns: SchedulerCampaign[],
  deps: SchedulerDeps = {},
): Promise<SchedulerRunResult> {
  const nowFn = deps.now ?? (() => new Date());
  const budgetMs = deps.budgetMs ?? SCHEDULER_BUDGET_MS;
  const leaseTtlMs = deps.leaseTtlMs ?? SCHEDULER_LEASE_TTL_MS;
  const startedAt = nowFn();
  const startedAtMs = startedAt.getTime();

  // Atomic take: overlapping ticks can no longer both pass a read-then-write check.
  const { acquireWorkerLease, releaseWorkerLease, logWorkerRun } = await import("./worker-lease.server");
  const lease = await acquireWorkerLease(supabase, LEASE_KEY, leaseTtlMs, startedAt);
  if (!lease) {
    logWorkerRun({ worker: "campaign-worker", startedAt: startedAtMs, result: "skipped", reason: "locked" });
    return { ok: true, skipped: "locked", campaigns: campaigns.length, processed: 0, budgetExhausted: false, recovered: 0, results: [] };
  }

  const cursor = ((await readSetting(supabase, CURSOR_KEY)) as { campaignId?: string } | null)?.campaignId ?? null;
  const ordered = orderCampaignsForRun(campaigns, cursor);

  const runOne =
    deps.runCampaign ??
    (async (campaignId: string, now: Date) => {
      const { runCampaign } = await import("./dispatch.server");
      return runCampaign(supabase, {
        campaignId,
        limit: deps.perCampaignLimit ?? 25,
        now,
        // Stop sending before the cron HTTP request can time out; the leftover
        // queue stays `scheduled` for the next invocation.
        deadlineAt: new Date(startedAtMs + budgetMs),
      });
    });
  const recover = deps.recover ?? ((campaignId: string, now: Date) => recoverInterruptedMessages(supabase, campaignId, now));

  const results: SchedulerRunResult["results"] = [];
  let recovered = 0;
  let budgetExhausted = false;
  let lastProcessed: string | null = cursor;

  try {
    for (const campaign of ordered) {
      if (!hasBudgetRemaining(startedAtMs, nowFn().getTime(), budgetMs)) {
        budgetExhausted = true;
        break;
      }
      try {
        recovered += await recover(campaign.id, nowFn());
        const result = await runOne(campaign.id, nowFn());
        results.push({ id: campaign.id, sent: result.sent, failed: result.failed, scheduled: result.scheduled });
      } catch (error) {
        console.error("campaign scheduler failed", campaign.id, error);
        results.push({ id: campaign.id, sent: 0, failed: 1, scheduled: 0 });
      }
      lastProcessed = campaign.id;
    }
  } finally {
    // Always release, even when an invocation dies mid-run: a held lease made
    // every following cron tick skip with `locked` and stalled the queue.
    await writeSetting(supabase, CURSOR_KEY, { campaignId: budgetExhausted ? lastProcessed : null });
    await releaseWorkerLease(supabase, lease);
  }
  logWorkerRun({
    worker: "campaign-worker",
    startedAt: startedAtMs,
    result: "ok",
    campaigns: campaigns.length,
    processed: results.length,
    sent: results.reduce((n, r) => n + r.sent, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    recovered,
    budget_exhausted: budgetExhausted,
  });

  return {
    ok: true,
    campaigns: campaigns.length,
    processed: results.length,
    budgetExhausted,
    recovered,
    results,
  };
}
