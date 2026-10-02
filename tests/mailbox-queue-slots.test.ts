import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { runMailboxQueue, MAILBOX_RUN_BUDGET_MS, MAILBOX_WAIT_DEADLINE_MS } from "@/lib/mailbox-queue.server";
import type { MailboxPollOutcome, PollMailboxRow } from "@/lib/mailbox-imap-poll.server";

/** Platform kills background runs at roughly this point. */
const PLATFORM_CUTOFF_MS = 30_000;
const SLOW = "info-slow-gmail"; // simulates the real ~22.7s Gmail mailbox

const row = (id: string): PollMailboxRow => ({
  id, workspace_id: "w", email_address: `${id}@x.test`, imap_host: "imap.gmail.com", imap_port: 993, imap_secure: true,
  imap_username: "u", imap_password: "p", last_imap_uid: 0, status: "connected", is_active: true,
});

type Job = { id: string; idempotency_key: string; payload: { mailbox_id: string }; status: string; attempts: number; max_attempts: number; lease_until?: number };

function fakeClient() {
  const jobs: Job[] = [];
  const health: Array<Record<string, unknown>> = [];
  let leaseTaken = false; let released = 0; let maxClaim = 0; let handBacks = 0; let finishCalls = 0;
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "or", "in", "select", "lt", "order", "limit"]) c[m] = () => c;
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
    return c;
  };
  const client = {
    from(table: string) {
      if (table === "platform_settings") return {
        update: (p: { value: { expiresAt: string } }) => {
          if (new Date(p.value.expiresAt).getTime() === 0) { leaseTaken = false; released++; return chain({ data: [], error: null }); }
          const ok = !leaseTaken; if (ok) leaseTaken = true;
          return chain({ data: ok ? [{ key: "x" }] : [], error: null });
        },
        upsert: () => ({ select: async () => ({ data: [], error: null }) }),
      };
      if (table === "background_jobs") return {
        select: (cols?: string) => {
          if (cols === "attempts") {
            const f: Record<string, string> = {};
            const c: Record<string, unknown> = {};
            c.eq = (k: string, v: string) => { f[k] = v; return c; };
            c.maybeSingle = async () => ({ data: jobs.find((j) => j.id === f.id && j.status === f.status) ?? null });
            return c;
          }
          return chain({ data: jobs.filter((j) => ["queued", "running"].includes(j.status)), error: null });
        },
        update: (patch: Partial<Job> & { next_attempt_at?: string }) => {
          const f: Record<string, string> = {};
          const c: Record<string, unknown> = {};
          c.eq = (k: string, v: string) => {
            f[k] = v;
            if (f.id && f.status) {
              const j = jobs.find((x) => x.id === f.id && x.status === f.status);
              if (j) { j.status = patch.status!; j.attempts = patch.attempts!; j.lease_until = undefined; handBacks++; }
            }
            return c;
          };
          return c;
        },
        insert: async (r: Job) => {
          if (jobs.some((j) => j.idempotency_key === r.idempotency_key)) return { error: { code: "23505", message: "dup" } };
          jobs.push({ ...r, id: `job-${jobs.length}`, status: "queued", attempts: 0 }); return { error: null };
        },
      };
      if (table === "worker_health") return { upsert: async (r: Record<string, unknown>) => { health.push(r); return {}; } };
      throw new Error(table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_background_jobs") {
        maxClaim = Math.max(maxClaim, args._limit as number);
        const now = Date.now();
        // FOR UPDATE SKIP LOCKED semantics: queued, or running with an EXPIRED lease only.
        const claimable = jobs.filter((j) => j.status === "queued" || (j.status === "running" && (j.lease_until ?? 0) < now));
        const claimed = claimable.slice(0, args._limit as number);
        claimed.forEach((j) => { j.status = "running"; j.attempts++; j.lease_until = now + (args._lease_seconds as number) * 1000; });
        return { data: claimed, error: null };
      }
      finishCalls++;
      const j = jobs.find((x) => x.id === args._id)!;
      j.status = args._ok ? "succeeded" : j.attempts >= j.max_attempts ? "dead" : "backoff";
      return { error: null };
    },
  };
  return { client, jobs, health, released: () => released, isLeaseTaken: () => leaseTaken, maxClaim: () => maxClaim, handBacks: () => handBacks, finishCalls: () => finishCalls };
}

/** Simulated IMAP reads on a virtual clock: per-mailbox duration, tracks concurrency. */
function simPoll(durations: Record<string, number>, fallback = 4_000) {
  let active = 0; let peak = 0;
  const log: Array<{ id: string; start: number; end: number }> = [];
  const poll = async (r: PollMailboxRow): Promise<MailboxPollOutcome> => {
    active++; peak = Math.max(peak, active);
    const start = Date.now();
    await new Promise((res) => setTimeout(res, durations[r.id] ?? fallback));
    active--;
    log.push({ id: r.id, start, end: Date.now() });
    return { mailbox: r.email_address, ok: true, fetched: 1, replies: 1, warmup: 0, bounces: 0, skipped: 0, highestUid: 1 };
  };
  return { poll, log, peak: () => peak };
}

async function run(f: ReturnType<typeof fakeClient>, ids: string[], poll: (r: PollMailboxRow) => Promise<MailboxPollOutcome>) {
  const t0 = Date.now();
  const p = runMailboxQueue({ client: f.client, now: () => Date.now(), loadMailboxes: async (_l, only) => (only ?? ids).map(row), poll });
  await vi.runAllTimersAsync();
  const res = await p;
  return { res, elapsed: Date.now() - t0 };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T17:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

const ids16 = [SLOW, ...Array.from({ length: 15 }, (_, i) => `m${i}`)];

describe("mailbox queue: slot scheduler", () => {
  it("cutoff for starting NEW reads is 10s, not a per-read timeout", () => {
    expect(MAILBOX_RUN_BUDGET_MS).toBe(10_000);
  });

  it("normal ~4s mailboxes: run ends well below the platform cutoff and releases the lock", async () => {
    const f = fakeClient(); const s = simPoll({});
    const { res, elapsed } = await run(f, ids16.slice(1), s.poll);
    expect(elapsed).toBeLessThan(PLATFORM_CUTOFF_MS);
    expect(res.failed).toBe(0);
    expect(f.released()).toBe(1);
    expect(f.isLeaseTaken()).toBe(false);
    expect(s.log.every((l) => l.start - Date.parse("2026-10-02T17:00:00Z") < MAILBOX_RUN_BUDGET_MS)).toBe(true);
  });

  it("slow ~23s Gmail mailbox completes uninterrupted, is NOT failed, and the run ends < 30s", async () => {
    const f = fakeClient(); const s = simPoll({ [SLOW]: 23_000 });
    const { res, elapsed } = await run(f, ids16, s.poll);
    const slow = s.log.find((l) => l.id === SLOW)!;
    expect(slow.end - slow.start).toBe(23_000);
    expect(f.jobs.find((j) => j.payload.mailbox_id === SLOW)!.status).toBe("succeeded");
    expect(res.failed).toBe(0);
    expect(elapsed).toBeLessThan(PLATFORM_CUTOFF_MS);
    expect(f.health.at(-1)!.status).toBe("healthy");
    expect(f.released()).toBe(1);
  });

  it("freed slots are refilled while the slow read is running; never more than 4 at once", async () => {
    const f = fakeClient(); const s = simPoll({ [SLOW]: 23_000 });
    await run(f, ids16, s.poll);
    expect(s.peak()).toBe(4);
    expect(f.maxClaim()).toBe(1); // one claim per freed slot
    const slow = s.log.find((l) => l.id === SLOW)!;
    // Reads started after a fast one finished, while the slow one was still running.
    expect(s.log.filter((l) => l.id !== SLOW && l.start > slow.start && l.start < slow.end).length).toBeGreaterThan(3);
  });

  it("no new read starts after the cutoff; started reads finish; the rest stay queued (not failed)", async () => {
    const f = fakeClient(); const s = simPoll({ [SLOW]: 23_000 });
    const { res } = await run(f, ids16, s.poll);
    const t0 = Date.parse("2026-10-02T17:00:00Z");
    expect(s.log.every((l) => l.start - t0 < MAILBOX_RUN_BUDGET_MS)).toBe(true);
    expect(res.budgetStop).toBe(true);
    const queued = f.jobs.filter((j) => j.status === "queued");
    expect(queued.length).toBe(16 - s.log.length);
    expect(queued.length).toBeGreaterThan(0);
    expect(f.jobs.some((j) => ["running", "backoff", "dead"].includes(j.status))).toBe(false);
  });

  it("next cycle processes leftovers with no duplicate jobs and no mailbox read twice", async () => {
    const f = fakeClient(); const s = simPoll({ [SLOW]: 23_000 });
    await run(f, ids16, s.poll);
    vi.setSystemTime(Date.now() + 4 * 60_000);
    await run(f, ids16, s.poll);
    const leftovers = f.jobs.filter((j) => j.status === "queued");
    vi.setSystemTime(Date.now() + 4 * 60_000);
    await run(f, ids16, s.poll);
    expect(new Set(f.jobs.map((j) => j.idempotency_key)).size).toBe(f.jobs.length);
    expect(leftovers.every((j) => j.status === "succeeded")).toBe(true);
    // never two reads of the same mailbox overlapping in time
    for (const id of ids16) {
      const reads = s.log.filter((l) => l.id === id).sort((a, b) => a.start - b.start);
      for (let i = 1; i < reads.length; i++) expect(reads[i].start).toBeGreaterThanOrEqual(reads[i - 1].end);
    }
  });

  it("a slow read still running is not reclaimed by a concurrent worker (lease 300s)", async () => {
    const f = fakeClient(); const s = simPoll({ [SLOW]: 23_000 });
    const p = runMailboxQueue({ client: f.client, now: () => Date.now(), loadMailboxes: async (_l, only) => (only ?? [SLOW]).map(row), poll: s.poll });
    await vi.advanceTimersByTimeAsync(15_000);
    const { data } = await f.client.rpc("claim_background_jobs", { _worker: "mailbox", _limit: 10, _lease_seconds: 300 });
    expect(data).toEqual([]);
    await vi.runAllTimersAsync(); await p;
    expect(s.log.filter((l) => l.id === SLOW).length).toBe(1);
  });

  it("crash recovery: a job left running by a killed run is reclaimed after its lease expires", async () => {
    const f = fakeClient(); const s = simPoll({});
    f.jobs.push({ id: "stuck", idempotency_key: "mailbox:s:old", payload: { mailbox_id: "s" }, status: "running", attempts: 1, max_attempts: 3, lease_until: Date.now() - 1 });
    const { res } = await run(f, ["s"], s.poll);
    expect(res.enqueued).toBe(0);
    expect(f.jobs.find((j) => j.id === "stuck")).toMatchObject({ status: "succeeded", attempts: 2 });
  });

  it("real failures still back off then go dead; slowness alone never fails a job", async () => {
    const f = fakeClient();
    const bad = async (r: PollMailboxRow): Promise<MailboxPollOutcome> => {
      await new Promise((res) => setTimeout(res, 23_000));
      return { mailbox: r.email_address, ok: false, error: "auth", fetched: 0, replies: 0, warmup: 0, bounces: 0, skipped: 0, highestUid: 0 };
    };
    for (let i = 0; i < 3; i++) {
      const j = f.jobs.find((x) => x.status === "backoff"); if (j) j.status = "queued";
      vi.setSystemTime(Date.now() + 60_000);
      await run(f, ["x"], bad);
    }
    expect(f.jobs[0]).toMatchObject({ status: "dead", attempts: 3 });
    expect(f.jobs.length).toBe(1);
  });

  it("lock already held: run skips without touching jobs", async () => {
    const f = fakeClient(); const s = simPoll({});
    await f.client.from("platform_settings").update({ value: { expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    const { res } = await run(f, ["a"], s.poll);
    expect(res.skipped).toBe("lease_held");
    expect(f.jobs.length).toBe(0);
  });

  describe("run deadline: a read slower than the platform limit", () => {
    it("deadline leaves headroom under the ~30s cutoff", () => {
      expect(MAILBOX_WAIT_DEADLINE_MS).toBeLessThanOrEqual(25_000);
      expect(MAILBOX_WAIT_DEADLINE_MS).toBeGreaterThan(MAILBOX_RUN_BUDGET_MS);
    });

    it("a 40s read never pushes the run past the deadline; others still finish; lock released", async () => {
      const f = fakeClient(); const s = simPoll({ [SLOW]: 40_000 });
      const t0 = Date.now();
      const p = runMailboxQueue({ client: f.client, now: () => Date.now(), loadMailboxes: async (_l, only) => (only ?? ids16).map(row), poll: s.poll });
      let doneAt = 0; void p.then(() => { doneAt = Date.now(); });
      await vi.advanceTimersByTimeAsync(MAILBOX_WAIT_DEADLINE_MS + 1);
      const res = await p;
      expect(doneAt - t0).toBeLessThanOrEqual(MAILBOX_WAIT_DEADLINE_MS);
      expect(doneAt - t0).toBeLessThan(PLATFORM_CUTOFF_MS);
      expect(res.handedBack).toBe(1);
      expect(res.failed).toBe(0);
      expect(res.succeeded).toBeGreaterThan(3); // the slow mailbox did not block others
      expect(f.released()).toBe(1);
      expect(f.isLeaseTaken()).toBe(false);
      // slow job back in the queue, attempt not spent, never failed/dead
      expect(f.jobs.find((j) => j.payload.mailbox_id === SLOW)).toMatchObject({ status: "queued", attempts: 0 });
      expect(f.jobs.some((j) => ["running", "backoff", "dead"].includes(j.status))).toBe(false);
      // The in-flight read was NOT aborted: it completes later, and does not touch the handed-back job.
      const finishesBefore = f.finishCalls();
      await vi.runAllTimersAsync();
      expect(s.log.find((l) => l.id === SLOW)!.end - s.log.find((l) => l.id === SLOW)!.start).toBe(40_000);
      expect(f.finishCalls()).toBe(finishesBefore);
      expect(f.jobs.find((j) => j.payload.mailbox_id === SLOW)!.status).toBe("queued");
    });

    it("next cycle picks the handed-back mailbox up with no duplicate job", async () => {
      const f = fakeClient(); const s1 = simPoll({ [SLOW]: 40_000 });
      const p = runMailboxQueue({ client: f.client, now: () => Date.now(), loadMailboxes: async (_l, only) => (only ?? ids16).map(row), poll: s1.poll });
      await vi.runAllTimersAsync(); await p;
      vi.setSystemTime(Date.now() + 4 * 60_000);
      const s2 = simPoll({ [SLOW]: 20_000 });
      await run(f, ids16, s2.poll);
      const slowJobs = f.jobs.filter((j) => j.payload.mailbox_id === SLOW);
      expect(slowJobs.length).toBe(1);
      expect(slowJobs[0]).toMatchObject({ status: "succeeded", attempts: 1 });
      expect(new Set(f.jobs.map((j) => j.idempotency_key)).size).toBe(f.jobs.length);
    });

    it("hand-back never reopens a job that already finished", async () => {
      const f = fakeClient(); const s = simPoll({});
      await run(f, ["a", "b"], s.poll);
      expect(f.handBacks()).toBe(0);
      expect(f.jobs.every((j) => j.status === "succeeded")).toBe(true);
    });
  });
});
