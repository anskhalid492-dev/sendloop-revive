import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { parseWorkerMode, getWorkerMode } from "@/lib/worker-mode.server";
import { runInboundRetryQueue } from "@/lib/inbound-queue.server";
import { DEFAULT_INBOUND_OPS } from "@/lib/inbound-ops.server";

/** Minimal fake client: platform_settings lease, background_jobs, worker_health, rpc. */
function fakeClient(opts: { leaseHeld?: boolean; existingKeys?: string[]; failRetry?: boolean } = {}) {
  const jobs: Array<{ id: string; idempotency_key: string; payload: { event_id: string }; status: string }> = [];
  const keys = new Set(opts.existingKeys ?? []);
  const finished: Array<{ id: string; ok: boolean }> = [];
  const health: unknown[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "or", "in", "select", "lt", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => result;
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
    return c;
  };
  const client = {
    from(table: string) {
      if (table === "platform_settings") {
        return {
          update: () => chain({ data: opts.leaseHeld ? [] : [{ key: "x" }], error: null }),
          insert: async () => ({ error: opts.leaseHeld ? { code: "23505" } : null }),
        };
      }
      if (table === "background_jobs") {
        return {
          insert: async (row: { idempotency_key: string; payload: { event_id: string } }) => {
            if (keys.has(row.idempotency_key)) return { error: { code: "23505", message: "dup" } };
            keys.add(row.idempotency_key);
            jobs.push({ id: `job-${jobs.length}`, ...row, status: "queued" });
            return { error: null };
          },
        };
      }
      if (table === "worker_health") return { upsert: async (row: unknown) => { health.push(row); return {}; } };
      if (table === "email_events") return chain({ data: null });
      throw new Error(table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "claim_background_jobs") {
        const claimed = jobs.filter((j) => j.status === "queued");
        claimed.forEach((j) => (j.status = "running"));
        return { data: claimed, error: null };
      }
      finished.push({ id: args._id as string, ok: args._ok as boolean });
      return { error: null };
    },
  };
  return { client, jobs, finished, health };
}

const row = (id: string) => ({
  id, attempts: 1, status: "failed", last_retry_at: null, created_at: "2026-01-01T00:00:00Z",
  failure_code: null, from_email: null, subject: null, workspace_id: null, conversation_id: null, lead_id: null, routing_token: null,
});

describe("worker mode", () => {
  it("defaults to legacy for missing/invalid values", () => {
    expect(parseWorkerMode(null, "inbound")).toBe("legacy");
    expect(parseWorkerMode({ inbound: "Queue" }, "inbound")).toBe("legacy");
    expect(parseWorkerMode({ inbound: "legacy" }, "inbound")).toBe("legacy");
    expect(parseWorkerMode({ inbound: "queue", campaign: "legacy" }, "campaign")).toBe("legacy");
    expect(parseWorkerMode({ inbound: "queue" }, "inbound")).toBe("queue");
  });
  it("falls back to legacy when the settings read fails", async () => {
    const broken = { from: () => { throw new Error("db down"); } };
    expect(await getWorkerMode(broken, "inbound")).toBe("legacy");
  });
});

describe("inbound queue mode", () => {
  const base = { getSettings: async () => DEFAULT_INBOUND_OPS };

  it("enqueues, claims, retries and finishes each due event once", async () => {
    const f = fakeClient();
    const retry = vi.fn(async () => ({ status: "processed" }));
    const res = await runInboundRetryQueue({ ...base, client: f.client, retry,
      selectDue: async () => ({ due: [row("a"), row("b")], skipped: 0, exhausted: 0 }) });
    expect(res).toMatchObject({ enqueued: 2, succeeded: 2, failed: 0 });
    expect(retry).toHaveBeenCalledTimes(2);
    expect(f.finished.every((x) => x.ok)).toBe(true);
    expect(f.health.length).toBeGreaterThan(0);
  });

  it("ignores duplicate idempotency keys (no double retry)", async () => {
    const f = fakeClient({ existingKeys: ["a:1"] });
    const retry = vi.fn(async () => ({ status: "processed" }));
    const res = await runInboundRetryQueue({ ...base, client: f.client, retry,
      selectDue: async () => ({ due: [row("a")], skipped: 0, exhausted: 0 }) });
    expect(res).toMatchObject({ enqueued: 0, succeeded: 0 });
    expect(retry).not.toHaveBeenCalled();
  });

  it("does nothing while another tick holds the lease", async () => {
    const f = fakeClient({ leaseHeld: true });
    const retry = vi.fn();
    const res = await runInboundRetryQueue({ ...base, client: f.client, retry,
      selectDue: async () => ({ due: [row("a")], skipped: 0, exhausted: 0 }) });
    expect(res).toMatchObject({ skipped: "lease_held" });
    expect(retry).not.toHaveBeenCalled();
  });

  it("records a failed job for retry instead of crashing the tick", async () => {
    const f = fakeClient();
    const res = await runInboundRetryQueue({ ...base, client: f.client,
      retry: async () => { throw new Error("timeout"); },
      selectDue: async () => ({ due: [row("a")], skipped: 0, exhausted: 0 }) });
    expect(res).toMatchObject({ failed: 1, succeeded: 0 });
    expect(f.finished).toEqual([{ id: "job-0", ok: false }]);
  });
});
