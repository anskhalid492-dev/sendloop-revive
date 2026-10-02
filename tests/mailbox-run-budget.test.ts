import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { pollRowsWithinBudget, RUN_BUDGET_MS } from "@/lib/mailbox-imap-poll.server";
import { runMailboxQueue, MAILBOX_RUN_BUDGET_MS } from "@/lib/mailbox-queue.server";
import type { MailboxPollOutcome, PollMailboxRow } from "@/lib/mailbox-imap-poll.server";

const row = (id: string): PollMailboxRow => ({
  id, workspace_id: "w", email_address: `${id}@x.test`, imap_host: "h", imap_port: 993, imap_secure: true,
  imap_username: "u", imap_password: "p", last_imap_uid: 0, status: "connected", is_active: true,
});
const ok = (r: PollMailboxRow): MailboxPollOutcome => ({ mailbox: r.email_address, ok: true, fetched: 1, replies: 1, warmup: 0, bounces: 0, skipped: 0, highestUid: 1 });

/** Simulated clock: each poll "takes" `cost` ms. */
function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("run budget (shared limit)", () => {
  it("budget is well under the ~30s background limit", () => {
    expect(RUN_BUDGET_MS).toBe(20_000); // legacy path unchanged
    expect(MAILBOX_RUN_BUDGET_MS).toBe(10_000); // queue: start-new-work cutoff
  });
});

describe("legacy path: pollRowsWithinBudget", () => {
  it("stops STARTING mailboxes once the budget is spent; in-flight reads finish", async () => {
    const c = clock();
    const finished: string[] = [];
    const poll = async (r: PollMailboxRow) => { c.advance(3_000); await Promise.resolve(); finished.push(r.id); return ok(r); };
    const rows = Array.from({ length: 30 }, (_, i) => row(`m${i}`));
    const { results, deferred } = await pollRowsWithinBudget(rows, poll, { now: c.now, budgetMs: 20_000, concurrency: 4 });
    // every started mailbox completed — none were cut off
    expect(finished.length).toBe(results.length);
    expect(results.length).toBeLessThan(30);
    expect(deferred).toBe(30 - results.length);
    // the first unstarted row is next in rotation order
    expect(results.map((r) => r.mailbox)).toEqual(rows.slice(0, results.length).map((r) => r.email_address).filter((e) => results.some((x) => x.mailbox === e)));
  });

  it("never exceeds 4 concurrent mailbox reads", async () => {
    let active = 0; let peak = 0;
    const poll = async (r: PollMailboxRow) => { active++; peak = Math.max(peak, active); await new Promise((res) => setTimeout(res, 2)); active--; return ok(r); };
    await pollRowsWithinBudget(Array.from({ length: 12 }, (_, i) => row(`m${i}`)), poll);
    expect(peak).toBe(4);
  });

  it("deferred mailboxes are not counted as failures and are processed next run", async () => {
    const c = clock();
    const rows = Array.from({ length: 10 }, (_, i) => row(`m${i}`));
    const seen = new Set<string>();
    const poll = async (r: PollMailboxRow) => { c.advance(10_000); seen.add(r.id); return ok(r); };
    const first = await pollRowsWithinBudget(rows, poll, { now: c.now, concurrency: 1 });
    expect(first.results.every((r) => r.ok)).toBe(true);
    expect(first.deferred).toBeGreaterThan(0);
    const leftover = rows.filter((r) => !seen.has(r.id));
    const c2 = clock();
    const second = await pollRowsWithinBudget(leftover, async (r) => { c2.advance(1); seen.add(r.id); return ok(r); }, { now: c2.now });
    expect(second.deferred).toBe(0);
    expect(seen.size).toBe(10);
  });
});

// Minimal fake client for the queue path.
function fakeClient() {
  const jobs: Array<{ id: string; idempotency_key: string; payload: { mailbox_id: string }; status: string; attempts: number; max_attempts: number; lease_until?: number }> = [];
  let leaseTaken = false; let released = 0; let t = 0;
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
          const okL = !leaseTaken; if (okL) leaseTaken = true;
          return chain({ data: okL ? [{ key: "x" }] : [], error: null });
        },
        insert: async () => ({ error: { code: "23505" } }),
      };
      if (table === "background_jobs") return {
        select: () => chain({ data: jobs.filter((j) => ["queued", "running"].includes(j.status)), error: null }),
        insert: async (r: { idempotency_key: string; payload: { mailbox_id: string }; max_attempts: number }) => {
          if (jobs.some((j) => j.idempotency_key === r.idempotency_key)) return { error: { code: "23505", message: "dup" } };
          jobs.push({ ...r, id: `job-${jobs.length}`, status: "queued", attempts: 0 }); return { error: null };
        },
      };
      if (table === "worker_health") return { upsert: async () => ({}) };
      throw new Error(table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_background_jobs") {
        // queued, or running with an expired lease (crash recovery)
        const claimable = jobs.filter((j) => j.status === "queued" || (j.status === "running" && (j.lease_until ?? 0) < t));
        const claimed = claimable.slice(0, args._limit as number);
        claimed.forEach((j) => { j.status = "running"; j.attempts++; j.lease_until = t + 300_000; });
        return { data: claimed, error: null };
      }
      const j = jobs.find((x) => x.id === args._id)!;
      j.status = args._ok ? "succeeded" : j.attempts >= j.max_attempts ? "dead" : "backoff";
      return { error: null };
    },
  };
  return { client, jobs, isLeaseTaken: () => leaseTaken, released: () => released, setT: (v: number) => { t = v; }, getT: () => t };
}

describe("queue path: runtime budget", () => {
  it("stops claiming new batches at the budget, releases the lease, leaves jobs queued (not failed)", async () => {
    const f = fakeClient();
    const ids = Array.from({ length: 17 }, (_, i) => `m${i}`);
    const polled: string[] = [];
    const poll = async (r: PollMailboxRow) => { f.setT(f.getT() + 8_000); polled.push(r.id); return ok(r); };
    const res = await runMailboxQueue({
      client: f.client, now: f.getT, loadMailboxes: async (_l, only) => (only ?? ids).map(row), poll,
    });
    expect(res.budgetStop).toBe(true);
    expect(res.failed).toBe(0);
    expect(f.isLeaseTaken()).toBe(false);
    expect(f.released()).toBe(1);
    const queued = f.jobs.filter((j) => j.status === "queued");
    expect(queued.length).toBe(17 - polled.length);
    expect(f.jobs.some((j) => j.status === "dead" || j.status === "backoff" || j.status === "running")).toBe(false);
    // every claimed job completed: active reads are never cut off
    expect(f.jobs.filter((j) => j.status === "succeeded").length).toBe(polled.length);
  });

  it("next run processes the leftovers without creating duplicate jobs", async () => {
    const f = fakeClient();
    const ids = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const counts = new Map<string, number>();
    const poll = async (r: PollMailboxRow) => { f.setT(f.getT() + 3_000); counts.set(r.id, (counts.get(r.id) ?? 0) + 1); return ok(r); };
    const load = async (_l: number, only?: string[]) => (only ?? ids).map(row);
    await runMailboxQueue({ client: f.client, now: f.getT, loadMailboxes: load, poll, budgetMs: 20_000 });
    const firstPolled = new Set(counts.keys());
    expect(firstPolled.size).toBeLessThan(10);
    expect(f.jobs.filter((j) => j.status === "queued").length).toBe(10 - firstPolled.size);
    f.setT(f.getT() + 60_000);
    await runMailboxQueue({ client: f.client, now: f.getT, loadMailboxes: load, poll, budgetMs: 20_000 });
    expect(counts.size).toBe(10);
    for (const id of ids.filter((i) => !firstPolled.has(i))) {
      expect(f.jobs.filter((j) => j.payload.mailbox_id === id).length).toBe(1);
    }
    // never two jobs with the same idempotency key
    expect(new Set(f.jobs.map((j) => j.idempotency_key)).size).toBe(f.jobs.length);
  });

  it("an expired 'running' job from a killed run is reclaimed and completed", async () => {
    const f = fakeClient();
    f.jobs.push({ id: "stuck", idempotency_key: "mailbox:s:old", payload: { mailbox_id: "s" }, status: "running", attempts: 1, max_attempts: 3, lease_until: -1 });
    const poll = vi.fn(async (r: PollMailboxRow) => ok(r));
    const res = await runMailboxQueue({ client: f.client, now: f.getT, loadMailboxes: async (_l, only) => (only ?? ["s"]).map(row), poll });
    expect(res.enqueued).toBe(0); // open job exists → no duplicate
    expect(poll).toHaveBeenCalledTimes(1);
    expect(f.jobs.find((j) => j.id === "stuck")).toMatchObject({ status: "succeeded", attempts: 2 });
  });

  it("failures still back off and go dead after max attempts; budget stops are not failures", async () => {
    const f = fakeClient();
    const bad = async (r: PollMailboxRow): Promise<MailboxPollOutcome> => ({ ...ok(r), ok: false, error: "auth" });
    const load = async (_l: number, only?: string[]) => (only ?? ["x"]).map(row);
    for (let i = 0; i < 3; i++) {
      const j = f.jobs.find((x) => x.status === "backoff"); if (j) j.status = "queued";
      f.setT(f.getT() + 60_000);
      await runMailboxQueue({ client: f.client, now: f.getT, loadMailboxes: load, poll: bad });
    }
    expect(f.jobs[0]).toMatchObject({ status: "dead", attempts: 3 });
    expect(f.jobs.length).toBe(1);
  });
});
