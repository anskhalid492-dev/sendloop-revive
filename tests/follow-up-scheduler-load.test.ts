/**
 * Regression tests for the follow-up scheduler load optimization.
 * Fake in-memory data only; no provider, network or production access.
 */
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai-personalization-meta.server", () => ({
  aiExtras: () => ({ extras: {}, hold: false }),
  personalizationByLead: async () => new Map(),
  pendingPersonalizationLeads: async () => new Set(),
}));

import { scheduleFollowUps, selectRetryableMessages } from "@/lib/dispatch.server";
import { runCampaignScheduler } from "@/lib/campaign-scheduler.server";
import { countingDb, summarize } from "./helpers/counting-db";

const H = 3_600_000;
const C = "00000000-0000-4000-8000-0000000000c1";

function campaignDb(opts: {
  recipients: Array<{ id: string; sentAgoH: number; step?: number; extraMessages?: Array<Record<string, unknown>>; current_step?: number; next_send_at?: string | null }>;
  steps?: number;
  status?: string;
}) {
  const stepCount = opts.steps ?? 2;
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `step-${i + 1}`,
    campaign_id: C,
    step_order: i + 1,
    subject: `S${i + 1}`,
    body: `Hi {{first_name}} ${i + 1}`,
    wait_days: i === 0 ? 0 : 2,
    wait_hours: 0,
    delay_minutes: 0,
    step_type: "email",
  }));
  const recipients: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const leads: Record<string, unknown>[] = [];
  for (const r of opts.recipients) {
    const step = r.step ?? 1;
    recipients.push({
      id: r.id,
      campaign_id: C,
      lead_id: `lead-${r.id}`,
      status: "in_progress",
      current_step: r.current_step ?? step,
      sending_account_id: "acct-1",
      last_sent_at: null,
      next_send_at: r.next_send_at ?? null,
    });
    leads.push({ id: `lead-${r.id}`, email: `${r.id}@example.test`, first_name: "Fake" });
    for (let s = 1; s <= step; s += 1) {
      messages.push({
        campaign_id: C,
        recipient_id: r.id,
        step_order: s,
        status: "sent",
        sent_at: new Date(Date.now() - r.sentAgoH * H - (step - s) * 72 * H).toISOString(),
      });
    }
    messages.push(...(r.extraMessages ?? []).map((m) => ({ campaign_id: C, recipient_id: r.id, ...m })));
  }
  return countingDb(
    {
      campaigns: [
        {
          id: C,
          workspace_id: "ws-test",
          status: opts.status ?? "active",
          timezone: "UTC",
          send_days: [0, 1, 2, 3, 4, 5, 6],
          send_start_hour: 0,
          send_end_hour: 24,
          custom_variables: [],
          ai_enabled: false,
        },
      ],
      campaign_steps: steps,
      campaign_step_variants: [],
      campaign_recipients: recipients,
      campaign_messages: messages,
      leads,
      sending_accounts: [{ id: "acct-1", from_name: "Test", from_email: "t@example.test" }],
    },
    { campaign_messages: ["campaign_id", "recipient_id", "step_order"] },
  );
}

const jobs = (db: ReturnType<typeof countingDb>, rid: string, step: number) =>
  db.tables["campaign_messages"]!.filter((m) => m["recipient_id"] === rid && m["step_order"] === step);

describe("follow-up scheduler", () => {
  test("1. future follow-up keeps its time and is not queued", async () => {
    const db = campaignDb({ recipients: [{ id: "r1", sentAgoH: 1 }] });
    await scheduleFollowUps(db.client, C);
    expect(jobs(db, "r1", 2)).toHaveLength(0);
    const stored = db.tables["campaign_recipients"]![0]!["next_send_at"] as string;
    const sentAt = new Date(jobs(db, "r1", 1)[0]!["sent_at"] as string).getTime();
    expect(new Date(stored).getTime()).toBe(sentAt + 48 * H);
    // Second run: same due time, nothing rewritten.
    db.ops.length = 0;
    await scheduleFollowUps(db.client, C);
    expect(summarize(db.ops).rowsWritten).toBe(0);
    expect(db.tables["campaign_recipients"]![0]!["next_send_at"]).toBe(stored);
  });

  test("2. due follow-up is queued exactly once", async () => {
    const db = campaignDb({ recipients: [{ id: "r1", sentAgoH: 50 }] });
    const res = await scheduleFollowUps(db.client, C);
    expect(res.scheduled).toBe(1);
    expect(jobs(db, "r1", 2)).toHaveLength(1);
    expect(jobs(db, "r1", 2)[0]!["status"]).toBe("scheduled");
  });

  test("3. existing follow-up job is not reprocessed (no lead lookup, no write)", async () => {
    const db = campaignDb({
      recipients: [{ id: "r1", sentAgoH: 50, current_step: 2, extraMessages: [{ step_order: 2, status: "failed", sent_at: null }] }],
    });
    const res = await scheduleFollowUps(db.client, C);
    const s = summarize(db.ops);
    expect(res.scheduled).toBe(0);
    expect(s.leadRowsRead).toBe(0);
    expect(s.jobsCreated).toBe(0);
    expect(jobs(db, "r1", 2)).toHaveLength(1);
  });

  test("4. failed follow-up with retries left stays eligible for the retry path", () => {
    const dayStart = new Date("2026-10-09T00:00:00Z");
    const row = { id: "m1", status: "failed", attempts: 1, sent_at: null, last_error: "temporary failure", updated_at: "2026-10-08T10:00:00Z" };
    expect(selectRetryableMessages([row], dayStart).map((r) => r.id)).toEqual(["m1"]);
  });

  test("5. permanently failed follow-up is never retried or re-created", async () => {
    const dayStart = new Date("2026-10-09T00:00:00Z");
    const hard = { id: "m1", status: "failed", attempts: 1, sent_at: null, last_error: "550 5.1.1 No such user", updated_at: "2026-10-08T10:00:00Z" };
    const spent = { ...hard, id: "m2", attempts: 3, last_error: "temporary failure" };
    expect(selectRetryableMessages([hard, spent], dayStart)).toEqual([]);
    const db = campaignDb({
      recipients: [{ id: "r1", sentAgoH: 50, extraMessages: [{ step_order: 2, status: "failed", sent_at: null }] }],
    });
    await scheduleFollowUps(db.client, C);
    expect(jobs(db, "r1", 2)).toHaveLength(1);
  });

  test("6. multi-step campaign queues only the next step", async () => {
    const db = campaignDb({ steps: 4, recipients: [{ id: "r1", sentAgoH: 50, step: 2 }] });
    await scheduleFollowUps(db.client, C);
    expect(jobs(db, "r1", 3)).toHaveLength(1);
    expect(jobs(db, "r1", 4)).toHaveLength(0);
  });

  test("7. paused campaigns are never picked up by the scheduler", async () => {
    const { schedulerCanSend } = await import("@/lib/campaign-status-sync");
    expect(schedulerCanSend("paused")).toBe(false);
    expect(schedulerCanSend("completed")).toBe(false);
  });

  test("8 + 10. repeated runs with no changes write nothing and never duplicate", async () => {
    const db = campaignDb({
      recipients: [
        { id: "r1", sentAgoH: 1 },
        { id: "r2", sentAgoH: 50 },
      ],
    });
    await scheduleFollowUps(db.client, C);
    db.ops.length = 0;
    for (let i = 0; i < 5; i += 1) await scheduleFollowUps(db.client, C);
    const s = summarize(db.ops);
    expect(s.rowsWritten).toBe(0);
    expect(s.leadRowsRead).toBe(0);
    expect(jobs(db, "r2", 2)).toHaveLength(1);
  });

  test("9. overlapping scheduler runs: only one holds the lease", async () => {
    let resolveFirst!: () => void;
    const gate = new Promise<void>((r) => (resolveFirst = r));
    const settings = new Map<string, unknown>();
    // Minimal lease store emulating the atomic acquire RPC.
    const supabase = {
      rpc: async (_n: string, args: { p_key: string; p_token: string }) => {
        if (settings.has(args.p_key)) return { data: false, error: null };
        settings.set(args.p_key, args.p_token);
        return { data: true, error: null };
      },
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b, eq: () => b, upsert: async () => ({ error: null }),
          delete: () => b, update: () => b,
          maybeSingle: async () => ({ data: null }),
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
        };
        return b;
      },
    };
    vi.doMock("@/lib/worker-lease.server", () => ({
      acquireWorkerLease: async () => (settings.has("lease") ? null : (settings.set("lease", 1), { token: "t" })),
      releaseWorkerLease: async () => void settings.delete("lease"),
      logWorkerRun: () => {},
    }));
    let calls = 0;
    const runCampaign = async () => {
      calls += 1;
      await gate;
      return { sent: 0, failed: 0, scheduled: 0 };
    };
    const a = runCampaignScheduler(supabase, [{ id: C }], { runCampaign, recover: async () => 0 });
    await new Promise((r) => setTimeout(r, 10));
    const b = await runCampaignScheduler(supabase, [{ id: C }], { runCampaign, recover: async () => 0 });
    resolveFirst();
    await a;
    expect(b.skipped).toBe("locked");
    expect(calls).toBe(1);
    vi.doUnmock("@/lib/worker-lease.server");
  });
});
