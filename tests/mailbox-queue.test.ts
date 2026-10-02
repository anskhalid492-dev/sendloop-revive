import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { mailboxJobKey, runMailboxQueue, MAILBOX_JOB_MAX_ATTEMPTS } from "@/lib/mailbox-queue.server";
import type { MailboxPollOutcome, PollMailboxRow } from "@/lib/mailbox-imap-poll.server";

type Job = { id: string; idempotency_key: string; payload: { mailbox_id: string }; status: string; attempts: number; max_attempts: number };

function fakeClient(opts: { leaseHeld?: boolean; openFor?: string[] } = {}) {
  const jobs: Job[] = (opts.openFor ?? []).map((id, i) => ({
    id: `open-${i}`, idempotency_key: `old:${id}`, payload: { mailbox_id: id }, status: "running", attempts: 1, max_attempts: 3,
  }));
  const health: Array<Record<string, unknown>> = [];
  let leaseTaken = Boolean(opts.leaseHeld);
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "or", "in", "select", "lt", "order", "limit"]) c[m] = () => c;
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
    return c;
  };
  const client = {
    from(table: string) {
      if (table === "platform_settings") {
        return {
          update: (patch: { value: { expiresAt: string } }) => {
            if (new Date(patch.value.expiresAt).getTime() === 0) { leaseTaken = false; return chain({ data: [], error: null }); }
            const ok = !leaseTaken;
            if (ok) { leaseTaken = true; jobs.forEach((j) => { if (j.status === "backoff") j.status = "queued"; }); }
            return chain({ data: ok ? [{ key: "x" }] : [], error: null });
          },
          insert: async () => ({ error: { code: "23505" } }),
        };
      }
      if (table === "background_jobs") {
        return {
          select: () => chain({ data: jobs.filter((j) => ["queued", "running"].includes(j.status)), error: null }),
          insert: async (row: Job) => {
            if (jobs.some((j) => j.idempotency_key === row.idempotency_key)) return { error: { code: "23505", message: "dup" } };
            jobs.push({ ...row, id: `job-${jobs.length}`, status: "queued", attempts: 0 });
            return { error: null };
          },
        };
      }
      if (table === "worker_health") return { upsert: async (row: Record<string, unknown>) => { health.push(row); return {}; } };
      throw new Error(table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_background_jobs") {
        const claimed = jobs.filter((j) => j.status === "queued").slice(0, args._limit as number);
        claimed.forEach((j) => { j.status = "running"; j.attempts += 1; });
        return { data: claimed, error: null };
      }
      const job = jobs.find((j) => j.id === args._id)!;
      // Failed jobs wait out their backoff until a later tick.
      job.status = args._ok ? "succeeded" : job.attempts >= job.max_attempts ? "dead" : "backoff";
      return { error: null };
    },
  };
  return { client, jobs, health, isLeaseTaken: () => leaseTaken };
}

const row = (id: string): PollMailboxRow => ({
  id, workspace_id: "w", email_address: `${id}@x.test`, imap_host: "h", imap_port: 993, imap_secure: true,
  imap_username: "u", imap_password: "p", last_imap_uid: 0, status: "connected", is_active: true,
});
const ok = (r: PollMailboxRow): MailboxPollOutcome => ({ mailbox: r.email_address, ok: true, fetched: 1, replies: 1, warmup: 0, bounces: 0, skipped: 0, highestUid: 1 });
const loader = (ids: string[]) => async (_l: number, only?: string[]) => (only ?? ids).filter((i) => ids.includes(i)).map(row);

describe("mailbox queue mode", () => {
  it("enqueues one job per mailbox, polls each exactly once, finishes succeeded", async () => {
    const f = fakeClient();
    const poll = vi.fn(async (r: PollMailboxRow) => ok(r));
    const res = await runMailboxQueue({ client: f.client, loadMailboxes: loader(["a", "b", "c", "d", "e", "f"]), poll });
    expect(res).toMatchObject({ enqueued: 6, succeeded: 6, failed: 0, replies: 6 });
    expect(poll.mock.calls.map((c) => c[0].id).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(f.jobs.every((j) => j.status === "succeeded" && j.attempts === 1)).toBe(true);
    expect(f.health.at(-1)).toMatchObject({ worker: "mailbox", status: "healthy" });
    expect(f.isLeaseTaken()).toBe(false);
  });

  it("skips entirely when the shared mailbox_poll_lease is held (legacy or another run)", async () => {
    const f = fakeClient({ leaseHeld: true });
    const poll = vi.fn();
    const res = await runMailboxQueue({ client: f.client, loadMailboxes: loader(["a"]), poll });
    expect(res.skipped).toBe("lease_held");
    expect(poll).not.toHaveBeenCalled();
    expect(f.jobs).toHaveLength(0);
  });

  it("never enqueues or polls a mailbox that already has an open job", async () => {
    const f = fakeClient({ openFor: ["a"] });
    const poll = vi.fn(async (r: PollMailboxRow) => ok(r));
    const res = await runMailboxQueue({ client: f.client, loadMailboxes: loader(["a", "b"]), poll });
    expect(res.enqueued).toBe(1);
    expect(poll.mock.calls.map((c) => c[0].id)).toEqual(["b"]);
  });

  it("duplicate keys in the same minute are rejected, not double-queued", async () => {
    const f = fakeClient();
    const now = () => Date.parse("2026-10-02T16:00:10Z");
    await runMailboxQueue({ client: f.client, now, loadMailboxes: loader(["a"]), poll: async (r) => ok(r) });
    await runMailboxQueue({ client: f.client, now, loadMailboxes: loader(["a"]), poll: async (r) => ok(r) });
    expect(f.jobs).toHaveLength(1);
    expect(mailboxJobKey("a", new Date(now()))).toBe("mailbox:a:2026-10-02T16:00");
  });

  it("IMAP failure → retry on a later tick with backoff, dead after max attempts, never retried in the same run", async () => {
    const f = fakeClient();
    let t = Date.parse("2026-10-02T16:00:00Z");
    const poll = vi.fn(async (r: PollMailboxRow) => ({ ...ok(r), ok: false, replies: 0, error: "IMAP login failed" }));
    for (let i = 0; i < MAILBOX_JOB_MAX_ATTEMPTS; i++) {
      await runMailboxQueue({ client: f.client, now: () => t, loadMailboxes: loader(["a"]), poll });
      t += 4 * 60_000;
    }
    expect(poll).toHaveBeenCalledTimes(MAILBOX_JOB_MAX_ATTEMPTS); // one IMAP read per tick, like legacy
    expect(f.jobs[0]).toMatchObject({ status: "dead", attempts: MAILBOX_JOB_MAX_ATTEMPTS });
    // After dead-lettering the mailbox is still polled on the normal rotation.
    await runMailboxQueue({ client: f.client, now: () => t, loadMailboxes: loader(["a"]), poll });
    expect(f.jobs).toHaveLength(2);
  });

  it("one failing mailbox never blocks the others; worker stays healthy", async () => {
    const f = fakeClient();
    const poll = vi.fn(async (r: PollMailboxRow) => (r.id === "b" ? { ...ok(r), ok: false, error: "auth" } : ok(r)));
    const res = await runMailboxQueue({ client: f.client, loadMailboxes: loader(["a", "b", "c"]), poll });
    expect(res).toMatchObject({ succeeded: 2, failed: 1 });
    expect(f.health.at(-1)).toMatchObject({ status: "healthy", last_error: "auth" });
  });

  it("a mailbox disconnected after enqueue is skipped, not polled", async () => {
    const f = fakeClient();
    const poll = vi.fn(async (r: PollMailboxRow) => ok(r));
    let first = true;
    const load = async (_l: number, only?: string[]) => {
      if (only) return [];
      if (first) { first = false; return [row("a")]; }
      return [];
    };
    const res = await runMailboxQueue({ client: f.client, loadMailboxes: load, poll });
    expect(poll).not.toHaveBeenCalled();
    expect(res.succeeded).toBe(1);
  });

  it("releases the lease and records failure health on an unexpected error", async () => {
    const f = fakeClient();
    await expect(
      runMailboxQueue({ client: f.client, loadMailboxes: async () => { throw new Error("db down"); }, poll: async (r) => ok(r) }),
    ).rejects.toThrow("db down");
    expect(f.isLeaseTaken()).toBe(false);
    expect(f.health.at(-1)).toMatchObject({ status: "failed", last_error: "db down" });
  });
});
