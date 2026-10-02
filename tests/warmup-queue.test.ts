import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  runWarmupQueue, warmupJobKey, rotateBy, holdInterruptedQueueSends,
  WARMUP_RUN_BUDGET_MS, WARMUP_SEND_CONCURRENCY, OUTCOME_UNKNOWN_REASON, STALE_QUEUE_CLAIM_MS,
  type WarmupEngine,
} from "@/lib/warmup-queue.server";
import type { RunSummary } from "@/lib/warmup-engine.server";

type BgJob = { id: string; idempotency_key: string; status: string; attempts: number; max_attempts: number; lease_until: number; next_at: number };
type WJob = { id: string; sending_account_id: string; status: string; locked_by: string | null; locked_at: number | null; scheduled_at: number };

/** Simulated DB: background_jobs + warmup_jobs with the same claim semantics as the RPCs. */
function sim(opts: { warmupJobs?: WJob[]; leaseHeld?: boolean; paused?: boolean } = {}) {
  let t = 1_000_000;
  const bg: BgJob[] = [];
  const wj: WJob[] = opts.warmupJobs ?? [];
  const health: Array<Record<string, unknown>> = [];
  const lease = { held: Boolean(opts.leaseHeld), releases: 0 };
  let inFlight = 0; let peakInFlight = 0;
  const sendsByJob = new Map<string, number>();
  const sendLog: string[] = [];

  const client = {
    from(table: string) {
      if (table === "background_jobs") {
        const q = { _status: [] as string[] } as Record<string, unknown>;
        const c: Record<string, unknown> = {
          select: () => c, eq: () => c, in: (_k: string, v: string[]) => { q._status = v; return c; },
          limit: () => c,
          then: (r: (v: unknown) => unknown) => Promise.resolve({ data: bg.filter((j) => (q._status as string[]).includes(j.status)), error: null }).then(r),
        };
        return {
          ...c,
          insert: async (row: { idempotency_key: string; max_attempts: number }) => {
            if (bg.some((j) => j.idempotency_key === row.idempotency_key)) return { error: { code: "23505", message: "dup" } };
            bg.push({ id: `bg-${bg.length}`, idempotency_key: row.idempotency_key, status: "queued", attempts: 0, max_attempts: row.max_attempts, lease_until: 0, next_at: 0 });
            return { error: null };
          },
        };
      }
      if (table === "warmup_jobs") {
        let cutoff = 0; let prefix = "";
        const c: Record<string, unknown> = {
          update: () => c, eq: () => c, like: (_k: string, v: string) => { prefix = v.replace("%", ""); return c; },
          lt: (_k: string, v: string) => { cutoff = new Date(v).getTime(); return c; },
          select: () => {
            const hit = wj.filter((j) => j.status === "processing" && (j.locked_by ?? "").startsWith(prefix) && (j.locked_at ?? 0) < cutoff);
            hit.forEach((j) => { j.status = "failed"; j.locked_by = null; (j as unknown as { error: string }).error = OUTCOME_UNKNOWN_REASON; });
            return Promise.resolve({ data: hit.map((j) => ({ id: j.id })), error: null });
          },
        };
        return c;
      }
      if (table === "worker_health") return { upsert: async (row: Record<string, unknown>) => { health.push(row); return {}; } };
      throw new Error(table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_background_jobs") {
        const due = bg.filter((j) => (j.status === "queued" && j.next_at <= t) || (j.status === "running" && j.lease_until < t)).slice(0, args._limit as number);
        due.forEach((j) => { j.status = "running"; j.attempts += 1; j.lease_until = t + (args._lease_seconds as number) * 1000; });
        return { data: due, error: null };
      }
      if (name === "finish_background_job") {
        const j = bg.find((x) => x.id === args._id)!;
        if (args._ok) j.status = "succeeded";
        else if (j.attempts >= j.max_attempts) j.status = "dead";
        else { j.status = "queued"; j.next_at = t + 2 ** j.attempts * 30_000; }
        return { error: null };
      }
      if (name === "claim_warmup_jobs") {
        const due = wj.filter((j) => j.status === "queued" && j.scheduled_at <= t).slice(0, args._limit as number);
        due.forEach((j) => { j.status = "processing"; j.locked_by = args._worker as string; j.locked_at = t; });
        return { data: due.map((j) => ({ ...j })), error: null };
      }
      throw new Error(name);
    },
  };

  const engine = (over: Partial<WarmupEngine> & { sendMs?: number } = {}): WarmupEngine => ({
    acquireLease: async () => {
      if (opts.paused) return { acquired: false, paused: true, pauseReason: "manual" };
      if (lease.held) return { acquired: false, paused: false, pauseReason: null };
      lease.held = true; return { acquired: true, paused: false, pauseReason: null };
    },
    releaseLease: async () => { lease.held = false; lease.releases += 1; },
    emptySummary: () => ({ ok: true, scheduled: 0, claimed: 0, sent: 0, failed: 0, retried: 0, healthUpdated: 0, paused: [], errors: [] }) as RunSummary,
    scheduleWarmupDue: async () => [],
    processJob: async (_a, job, summary) => {
      inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
      t += over.sendMs ?? 1_000; await Promise.resolve();
      const id = job["id"] as string;
      sendsByJob.set(id, (sendsByJob.get(id) ?? 0) + 1);
      sendLog.push(job["sending_account_id"] as string);
      const row = wj.find((j) => j.id === id)!; row.status = "sent"; row.locked_by = null;
      summary.sent += 1; inFlight--;
    },
    sweepPlacement: async () => 0,
    recalculateHealth: async () => ({}),
    maxJobsPerRun: 40,
    ...over,
  });

  return {
    client, bg, wj, health, lease, engine, sendsByJob, sendLog,
    now: () => t, advance: (ms: number) => { t += ms; },
    peak: () => peakInFlight,
  };
}

const jobs = (n: number, accounts = 3, at = 0): WJob[] =>
  Array.from({ length: n }, (_, i) => ({ id: `w${i}`, sending_account_id: `acct${i % accounts}`, status: "queued", locked_by: null, locked_at: null, scheduled_at: at }));

describe("warmup queue mode", () => {
  it("sends every due warmup job exactly once, one tick job, succeeded, healthy, lease released", async () => {
    const s = sim({ warmupJobs: jobs(5) });
    const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
    expect(res).toMatchObject({ mode: "queue", sent: 5, claimed: 5, tickOk: 1, budgetStop: false });
    expect([...s.sendsByJob.values()].every((n) => n === 1)).toBe(true);
    expect(s.bg).toHaveLength(1);
    expect(s.bg[0]).toMatchObject({ status: "succeeded", idempotency_key: warmupJobKey(new Date(1_000_000)) });
    expect(s.health.at(-1)).toMatchObject({ worker: "warmup", status: "healthy" });
    expect(s.lease.held).toBe(false);
  });

  it("skips entirely when the shared warmup lease is held (legacy or another run)", async () => {
    const s = sim({ warmupJobs: jobs(3), leaseHeld: true });
    const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
    expect(res.skipped).toMatch(/in progress/);
    expect(s.sendsByJob.size).toBe(0);
    expect(s.bg).toHaveLength(0);
  });

  it("respects the paused runner (no sends, no jobs)", async () => {
    const s = sim({ warmupJobs: jobs(3), paused: true });
    const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
    expect(res.skipped).toMatch(/paused/);
    expect(s.sendsByJob.size).toBe(0);
  });

  it("never sends more than legacy's per-run cap (no volume increase)", async () => {
    const s = sim({ warmupJobs: jobs(60) });
    const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine({ sendMs: 10 }) });
    expect(res.sent).toBe(40);
    expect(s.wj.filter((j) => j.status === "queued")).toHaveLength(20);
  });

  it("honours a smaller ?limit like legacy", async () => {
    const s = sim({ warmupJobs: jobs(10) });
    const res = await runWarmupQueue({ client: s.client, now: s.now, limit: 3, engine: s.engine({ sendMs: 10 }) });
    expect(res.sent).toBe(3);
  });

  it("never sends jobs scheduled for later (schedule respected exactly)", async () => {
    const s = sim({ warmupJobs: jobs(4, 2, 5_000_000) });
    const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
    expect(res.sent).toBe(0);
    expect(s.wj.every((j) => j.status === "queued")).toBe(true);
  });

  it("sends sequentially: at most one SMTP operation in flight", async () => {
    const s = sim({ warmupJobs: jobs(8) });
    await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
    expect(WARMUP_SEND_CONCURRENCY).toBe(1);
    expect(s.peak()).toBe(1);
  });

  describe("runtime budget", () => {
    it("budget is well under the ~30s limit", () => expect(WARMUP_RUN_BUDGET_MS).toBe(20_000));

    it("stops starting sends at the budget; the in-flight send completes; leftovers stay queued; lease released", async () => {
      const s = sim({ warmupJobs: jobs(20) });
      const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine({ sendMs: 6_000 }) });
      expect(res.budgetStop).toBe(true);
      // 0,6,12,18 start (<20s) → 4 sends, each completed (none cut off)
      expect(res.sent).toBe(4);
      expect(s.wj.filter((j) => j.status === "processing")).toHaveLength(0);
      expect(s.wj.filter((j) => j.status === "queued")).toHaveLength(16);
      expect(s.wj.some((j) => j.status === "failed")).toBe(false);
      expect(s.bg[0]!.status).toBe("succeeded");
      expect(s.lease.held).toBe(false);
      expect(s.lease.releases).toBe(1);
    });

    it("the next tick sends the leftovers without any duplicate send", async () => {
      const s = sim({ warmupJobs: jobs(10) });
      const e = s.engine({ sendMs: 6_000 });
      await runWarmupQueue({ client: s.client, now: s.now, engine: e });
      s.advance(60_000);
      await runWarmupQueue({ client: s.client, now: s.now, engine: e });
      s.advance(60_000);
      await runWarmupQueue({ client: s.client, now: s.now, engine: e });
      expect(s.sendsByJob.size).toBe(10);
      expect([...s.sendsByJob.values()].every((n) => n === 1)).toBe(true);
      expect(new Set(s.bg.map((j) => j.idempotency_key)).size).toBe(s.bg.length);
    });

    it("scheduler phase gets a stop signal once the budget is spent and rotates its start", async () => {
      const s = sim();
      let calls = 0;
      const engine = s.engine({
        scheduleWarmupDue: async (_a, _sum, o) => {
          const rows = o.order!(["a", "b", "c", "d"].map((id) => ({ sending_account_id: id })));
          for (const _r of rows) { if (o.shouldStop!()) break; calls++; s.advance(8_000); }
          return rows;
        },
      });
      const res = await runWarmupQueue({ client: s.client, now: s.now, engine });
      expect(calls).toBe(3); // 0,8,16 start; 24 stopped
      expect(res.budgetStop).toBe(true);
      expect(rotateBy(1)([1, 2, 3])).toEqual([2, 3, 1]);
      expect(rotateBy(3)([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });

  describe("duplicate / concurrency protection", () => {
    it("a second tick in the same minute is rejected by the idempotency key", async () => {
      const s = sim({ warmupJobs: jobs(2) });
      const e = s.engine();
      await runWarmupQueue({ client: s.client, now: () => 1_000_000, engine: e });
      await runWarmupQueue({ client: s.client, now: () => 1_000_000, engine: e });
      expect(s.bg).toHaveLength(1);
    });

    it("no new tick is enqueued while one is still open", async () => {
      const s = sim();
      s.bg.push({ id: "open", idempotency_key: "warmup:old", status: "running", attempts: 1, max_attempts: 3, lease_until: s.now() + 60_000, next_at: 0 });
      await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
      expect(s.bg).toHaveLength(1);
      expect(s.bg[0]!.status).toBe("running"); // live lease: not stolen
    });

    it("a warmup job claimed by another worker is never sent again", async () => {
      const w = jobs(2);
      w[0]!.status = "processing"; w[0]!.locked_by = "worker_legacy"; w[0]!.locked_at = 1_000_000;
      const s = sim({ warmupJobs: w });
      await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
      expect(s.sendsByJob.has("w0")).toBe(false);
      expect(s.sendsByJob.get("w1")).toBe(1);
    });
  });

  describe("crash recovery and retries", () => {
    it("an expired tick lease from a killed run is reclaimed and completed", async () => {
      const s = sim({ warmupJobs: jobs(1) });
      s.bg.push({ id: "stuck", idempotency_key: "warmup:old", status: "running", attempts: 1, max_attempts: 3, lease_until: s.now() - 1, next_at: 0 });
      await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
      expect(s.bg).toHaveLength(1);
      expect(s.bg[0]).toMatchObject({ status: "succeeded", attempts: 2 });
    });

    it("a queue-owned send interrupted mid-flight is held as failed, never resent (at-most-once)", async () => {
      const w = jobs(1);
      w[0]!.status = "processing"; w[0]!.locked_by = "wq_dead"; w[0]!.locked_at = 1_000_000 - STALE_QUEUE_CLAIM_MS - 1;
      const s = sim({ warmupJobs: w });
      const res = await runWarmupQueue({ client: s.client, now: s.now, engine: s.engine() });
      expect(res.held).toBe(1);
      expect(s.wj[0]).toMatchObject({ status: "failed" });
      expect(s.sendsByJob.size).toBe(0);
    });

    it("a recent queue claim (not yet stale) is left alone", async () => {
      const w = jobs(1);
      w[0]!.status = "processing"; w[0]!.locked_by = "wq_live"; w[0]!.locked_at = 1_000_000 - 1_000;
      const s = sim({ warmupJobs: w });
      expect(await holdInterruptedQueueSends(s.client, s.now())).toBe(0);
      expect(s.wj[0]!.status).toBe("processing");
    });

    it("tick failure backs off with retry, then becomes dead after max attempts and stays inspectable", async () => {
      const s = sim();
      const engine = s.engine({ scheduleWarmupDue: async () => { throw new Error("db down"); } });
      for (let i = 0; i < 6; i++) {
        await runWarmupQueue({ client: s.client, now: s.now, engine });
        s.advance(10 * 60_000);
      }
      const tick = s.bg[0]!;
      expect(tick).toMatchObject({ status: "dead", attempts: 3 });
      expect(s.health.some((h) => h["status"] === "degraded")).toBe(true);
      expect(s.lease.held).toBe(false);
    });

    it("an unexpected error releases the lease and records failed health", async () => {
      const s = sim();
      const client = { ...s.client, rpc: async () => ({ data: null, error: { message: "claim exploded" } }) };
      await expect(runWarmupQueue({ client, now: s.now, engine: s.engine() })).rejects.toThrow("claim exploded");
      expect(s.lease.held).toBe(false);
      expect(s.health.at(-1)).toMatchObject({ status: "failed" });
    });
  });
});
