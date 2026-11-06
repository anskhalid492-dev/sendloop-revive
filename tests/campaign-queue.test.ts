import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  OUTCOME_UNKNOWN_REASON,
  campaignJobKey,
  recoverInterruptedForQueue,
  runCampaignQueue,
} from "@/lib/campaign-queue.server";
import { selectRetryableMessages } from "@/lib/dispatch.server";
import { decideInterrupted, isUncertainTransportError, outcomeUnknownReason, phaseMarker } from "@/lib/campaign-send-phase";

type Job = { id: string; idempotency_key: string; payload: { campaign_id: string }; status: string; attempts: number };

/** In-memory fake of the bits the queue touches: lease, jobs, rpc, health. */
function fakeClient(opts: { leaseHeld?: boolean; openFor?: string[] } = {}) {
  const jobs: Job[] = (opts.openFor ?? []).map((id, i) => ({
    id: `open-${i}`, idempotency_key: `old:${id}`, payload: { campaign_id: id }, status: "running", attempts: 1,
  }));
  const finished: Array<{ id: string; ok: boolean }> = [];
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
            const releasing = new Date(patch.value.expiresAt).getTime() === 0;
            if (releasing) { leaseTaken = false; return chain({ data: [], error: null }); }
            const ok = !leaseTaken;
            if (ok) { leaseTaken = true; jobs.forEach((j) => { if (j.status === "backoff") j.status = "queued"; }); }
            return chain({ data: ok ? [{ key: "x" }] : [], error: null });
          },
          upsert: () => ({ select: async () => ({ data: [], error: null }) }),
        };
      }
      if (table === "background_jobs") {
        return {
          select: () => chain({ data: jobs.filter((j) => ["queued", "running", "backoff"].includes(j.status)), error: null }),
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
        // SKIP LOCKED semantics: only queued jobs, each handed out once.
        const claimed = jobs.filter((j) => j.status === "queued").slice(0, args._limit as number);
        claimed.forEach((j) => { j.status = "running"; j.attempts += 1; });
        return { data: claimed, error: null };
      }
      const job = jobs.find((j) => j.id === args._id)!;
      // Failed jobs wait out their backoff (next_attempt_at) until a later tick.
      job.status = args._ok ? "succeeded" : job.attempts >= 5 ? "dead" : "backoff";
      finished.push({ id: args._id as string, ok: args._ok as boolean });
      return { error: null };
    },
  };
  return { client, jobs, finished, health, isLeaseTaken: () => leaseTaken };
}

const noRecover = async () => 0;

describe("campaign queue mode", () => {
  it("enqueues one job per campaign, claims, runs and finishes each once", async () => {
    const f = fakeClient();
    const run = vi.fn(async () => ({ sent: 2, failed: 0, scheduled: 0 }));
    const res = await runCampaignQueue({ client: f.client, runCampaign: run, recover: noRecover }, [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }]);
    expect(res).toMatchObject({ enqueued: 4, succeeded: 4, failed: 0, sent: 8 });
    expect(run).toHaveBeenCalledTimes(4);
    expect(new Set(run.mock.calls.map((c) => (c as unknown[])[0])).size).toBe(4);
    expect(f.health.at(-1)).toMatchObject({ worker: "campaign", status: "healthy" });
    expect(f.isLeaseTaken()).toBe(false);
  });

  it("never enqueues a second job for a campaign that already has an open one", async () => {
    const f = fakeClient({ openFor: ["c1"] });
    const run = vi.fn(async () => ({ sent: 0, failed: 0, scheduled: 0 }));
    const res = await runCampaignQueue({ client: f.client, runCampaign: run, recover: noRecover }, [{ id: "c1" }, { id: "c2" }]);
    expect(res.enqueued).toBe(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toBe("c2");
  });

  it("dedupes the same tick by idempotency key", async () => {
    const now = new Date("2026-10-02T15:00:30Z");
    expect(campaignJobKey("c1", now)).toBe(campaignJobKey("c1", new Date("2026-10-02T15:00:59Z")));
    expect(campaignJobKey("c1", now)).not.toBe(campaignJobKey("c1", new Date("2026-10-02T15:01:00Z")));
  });

  it("does nothing while the shared legacy/queue lease is held (no overlap with legacy)", async () => {
    const f = fakeClient({ leaseHeld: true });
    const run = vi.fn();
    const res = await runCampaignQueue({ client: f.client, runCampaign: run, recover: noRecover }, [{ id: "c1" }]);
    expect(res).toMatchObject({ skipped: "lease_held" });
    expect(run).not.toHaveBeenCalled();
    expect(f.jobs).toHaveLength(0);
  });

  it("concurrent ticks: only one runs; the other skips", async () => {
    const f = fakeClient();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = vi.fn(async () => { await gate; return { sent: 1, failed: 0, scheduled: 0 }; });
    const a = runCampaignQueue({ client: f.client, runCampaign: run, recover: noRecover }, [{ id: "c1" }]);
    await Promise.resolve();
    const b = await runCampaignQueue({ client: f.client, runCampaign: run, recover: noRecover }, [{ id: "c1" }]);
    release();
    expect(b).toMatchObject({ skipped: "lease_held" });
    expect(await a).toMatchObject({ succeeded: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("records a failed job for backoff retry and becomes dead after max attempts", async () => {
    const f = fakeClient();
    const boom = async () => { throw new Error("db timeout"); };
    for (let i = 0; i < 5; i += 1) {
      // Simulate backoff elapsing: requeued job becomes claimable next tick.
      await runCampaignQueue({ client: f.client, runCampaign: boom, recover: noRecover, now: () => new Date(Date.UTC(2026, 9, 2, 15, i)) }, [{ id: "c1" }]);
    }
    expect(f.jobs).toHaveLength(1);
    expect(f.jobs[0]).toMatchObject({ status: "dead", attempts: 5 });
    expect(f.finished.every((x) => !x.ok)).toBe(true);
    expect(f.health.at(-1)).toMatchObject({ status: "degraded" });
  });

  it("stops claiming when the time budget is exhausted", async () => {
    const f = fakeClient();
    let t = 0;
    const now = () => new Date(1_000_000 + t);
    const run = vi.fn(async () => { t += 30_000; return { sent: 0, failed: 0, scheduled: 0 }; });
    const res = await runCampaignQueue({ client: f.client, runCampaign: run, recover: noRecover, now, budgetMs: 20_000 }, [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }]);
    // One batch of 3 was claimed before the budget check stopped further claims.
    expect(run).toHaveBeenCalledTimes(3);
    expect(f.jobs.filter((j) => j.status === "queued")).toHaveLength(2);
    expect(res.succeeded).toBe(3);
  });
});

describe("queue-mode crash recovery (at-most-once)", () => {
  function recoveryClient(messages: Array<Record<string, unknown>>, registry: string[]) {
    const updates: Array<{ ids: string[]; patch: Record<string, unknown> }> = [];
    const q = (rows: Array<Record<string, unknown>>) => {
      let current = [...rows];
      const api: Record<string, unknown> = {};
      api.select = () => api;
      api.eq = (c: string, v: unknown) => { current = current.filter((r) => r[c] === v); return api; };
      api.is = (c: string, v: unknown) => { current = current.filter((r) => (r[c] ?? null) === v); return api; };
      api.in = (c: string, v: unknown[]) => { current = current.filter((r) => v.includes(r[c])); return api; };
      api.lte = () => api;
      api.limit = () => api;
      api.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: current, error: null }).then(r);
      return api;
    };
    const client = {
      from: (table: string) => {
        if (table === "outbound_messages") return q(registry.map((id) => ({ ref_id: id, ref_table: "campaign_messages", provider_message_id: `p-${id}`, provider: "smtp", created_at: "2026-10-02T14:00:00Z" })));
        const base = q(messages) as Record<string, unknown>;
        base.update = (patch: Record<string, unknown>) => {
          const u = { ids: [] as string[], patch };
          updates.push(u);
          const c: Record<string, unknown> = {};
          c.eq = (col: string, v: unknown) => { if (col === "id") u.ids.push(v as string); return c; };
          c.in = (_: string, ids: string[]) => { u.ids.push(...ids); return c; };
          c.is = () => c;
          c.select = () => c;
          c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: u.ids.map(id => ({ id })), error: null }).then(r);
          return c;
        };
        return base;
      },
    };
    return { client, updates };
  }

  it("completes provider-accepted rows and holds unknown-outcome rows without resending", async () => {
    const msgs = [
      { id: "accepted", campaign_id: "c1", status: "processing", sent_at: null, provider_message_id: null },
      { id: "unknown", campaign_id: "c1", status: "processing", sent_at: null, provider_message_id: null },
    ];
    const r = recoveryClient(msgs, ["accepted"]);
    await recoverInterruptedForQueue(r.client, "c1", new Date(), r.client);
    const sent = r.updates.find((u) => u.patch.status === "sent");
    const held = r.updates.find((u) => u.patch.status === "failed");
    expect(sent?.ids).toEqual(["accepted"]);
    expect(held?.ids).toEqual(["unknown"]);
    expect(String(held?.patch.last_error)).toContain(OUTCOME_UNKNOWN_REASON);
    // Never re-queued to scheduled:
    expect(r.updates.some((u) => u.patch.status === "scheduled")).toBe(false);
  });

  it("worker restart: a row claimed but never handed to the provider is requeued, not held", async () => {
    const msgs = [
      { id: "claimed", campaign_id: "c1", status: "processing", sent_at: null, provider_message_id: null, last_error: phaseMarker("claimed", new Date("2026-10-14T10:00:00Z")) },
    ];
    const r = recoveryClient(msgs, []);
    await recoverInterruptedForQueue(r.client, "c1", new Date(), r.client);
    const requeued = r.updates.find((u) => u.patch.status === "scheduled");
    expect(requeued?.ids).toEqual(["claimed"]);
    expect(r.updates.some((u) => u.patch.status === "failed")).toBe(false);
  });

  it("interrupted during the SMTP call: held unknown with the interruption point, never resent, never bounced", async () => {
    const msgs = [
      { id: "inflight", campaign_id: "c1", status: "processing", sent_at: null, provider_message_id: null, last_error: phaseMarker("provider_call", new Date("2026-10-14T10:00:05Z")) },
      { id: "legacy", campaign_id: "c1", status: "processing", sent_at: null, provider_message_id: null, last_error: null },
    ];
    const r = recoveryClient(msgs, []);
    await recoverInterruptedForQueue(r.client, "c1", new Date(), r.client);
    const held = r.updates.filter((u) => u.patch.status === "failed");
    expect(held.flatMap((u) => u.ids).sort()).toEqual(["inflight", "legacy"]);
    expect(String(held.find((u) => u.ids[0] === "inflight")?.patch.last_error)).toContain("provider_call at 2026-10-14T10:00:05.000Z");
    expect(String(held.find((u) => u.ids[0] === "legacy")?.patch.last_error)).toContain("unrecorded");
    expect(held.every((u) => u.patch.attempts === 999)).toBe(true);
    expect(r.updates.some((u) => ["scheduled", "sent", "bounced"].includes(String(u.patch.status)))).toBe(false);
  });

  it("SMTP accepted but the sent write was lost: registry proof completes it as sent, no resend", async () => {
    const msgs = [
      { id: "acc", campaign_id: "c1", status: "processing", sent_at: null, provider_message_id: null, last_error: phaseMarker("provider_call", new Date()) },
    ];
    const r = recoveryClient(msgs, ["acc"]);
    await recoverInterruptedForQueue(r.client, "c1", new Date(), r.client);
    expect(r.updates.find((u) => u.patch.status === "sent")?.ids).toEqual(["acc"]);
    expect(r.updates.some((u) => u.patch.status === "scheduled")).toBe(false);
  });

  it("send-phase rules", () => {
    expect(decideInterrupted(phaseMarker("claimed", new Date()))).toBe("requeue");
    expect(decideInterrupted(phaseMarker("provider_call", new Date()))).toBe("hold_unknown");
    expect(decideInterrupted(null)).toBe("hold_unknown");
    expect(decideInterrupted("SMTP 550 user unknown")).toBe("hold_unknown");
    expect(isUncertainTransportError("The operation was aborted due to timeout")).toBe(true);
    expect(isUncertainTransportError("550 5.1.1 User unknown")).toBe(false);
  });

  it("the daily retry never picks up a held unknown even with a low attempt count", () => {
    const rows = selectRetryableMessages(
      [{ id: "u", status: "failed", attempts: 1, sent_at: null, last_error: outcomeUnknownReason(null), updated_at: "2026-01-01T00:00:00Z" }],
      new Date("2026-10-02T00:00:00Z"),
    );
    expect(rows).toHaveLength(0);
  });

  it("the existing daily retry never picks up a held unknown-outcome message", () => {
    const rows = selectRetryableMessages(
      [{ id: "unknown", status: "failed", attempts: 999, sent_at: null, last_error: OUTCOME_UNKNOWN_REASON, updated_at: "2026-01-01T00:00:00Z" }],
      new Date("2026-10-02T00:00:00Z"),
    );
    expect(rows).toHaveLength(0);
  });
});
