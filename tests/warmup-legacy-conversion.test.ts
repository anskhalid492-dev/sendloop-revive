import { describe, expect, it } from "vitest";
import { resolveDailyTarget } from "@/lib/warmup-engine.server";

// Isolated fixtures only — no customer accounts, no network.
const account = {
  id: "acc-fixture-1",
  workspace_id: "ws-fixture-1",
  from_name: "Fixture",
  from_email: "fixture@example.test",
  provider: "smtp",
  provider_id: null,
  connection_method: null,
  status: "verified",
  paused: false,
  customer_enabled: true,
  health_score: 100,
  spf_status: "pass",
  dkim_status: "pass",
  dmarc_status: "pass",
};

const startedAt = new Date(Date.now() - 20 * 86_400_000).toISOString();
const expectedCalendarDay = Math.max(1, Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(new Date(startedAt).toISOString().slice(0, 10))) / 86_400_000) + 1);

function settingsFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "set-fixture-1",
    sending_account_id: "acc-fixture-1",
    workspace_id: "ws-fixture-1",
    enabled: true,
    start_volume: 4,
    max_volume: 40,
    daily_increase: 2,
    ramp_days: 30,
    send_days: [0, 1, 2, 3, 4, 5, 6],
    send_start_hour: 0,
    send_end_hour: 23,
    reply_rate: 35,
    max_bounce_rate: 5,
    min_health_score: 50,
    auto_pause: true,
    paused_by_system: false,
    started_at: startedAt,
    ramp_stage: null,
    stage_since: null,
    stage_reason: null,
    current_volume: 6,
    hold_failure_rate: null,
    recovery_bounce_rate: null,
    recovery_days: null,
    progression_mode: "legacy",
    progression_stages: null,
    manual_daily_limit: null,
    progression_day: null,
    progression_date: null,
    progression_limit: null,
    progression_review_required: true,
    ...overrides,
  };
}

type Update = { table: string; payload: Record<string, unknown> };

function fakeAdmin() {
  const updates: Update[] = [];
  const admin = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = (): unknown => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.gte = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.not = chain;
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.update = (payload: Record<string, unknown>) => {
        updates.push({ table, payload });
        return builder;
      };
      builder.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return { admin, updates };
}

describe("legacy warmup rows convert to automatic progression", () => {
  it("seeds an existing legacy mailbox at its calendar day and current volume", async () => {
    const { admin, updates } = fakeAdmin();
    const decision = await resolveDailyTarget(admin as never, account as never, settingsFixture() as never);

    const seeded = updates.find((u) => u.payload.progression_mode === "automatic");
    expect(seeded).toBeTruthy();
    expect(seeded?.payload.progression_day).toBe(expectedCalendarDay);
    expect(seeded?.payload.progression_limit).toBe(6);
    expect(seeded?.payload.progression_review_required).toBe(false);

    // Today must hold the legacy volume: no same-day jump.
    expect(decision.target).toBe(6);
    const checkpoint = updates[updates.length - 2]?.payload;
    expect(checkpoint?.progression_limit).toBe(6);
    expect(checkpoint?.progression_day).toBe(expectedCalendarDay);
  });

  it("keeps the legacy engine when the start date is unknown", async () => {
    const { admin, updates } = fakeAdmin();
    await resolveDailyTarget(admin as never, account as never, settingsFixture({ started_at: null }) as never);

    expect(updates.some((u) => u.payload.progression_mode === "automatic")).toBe(false);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("does not re-convert mailboxes already on automatic progression", async () => {
    const { admin, updates } = fakeAdmin();
    await resolveDailyTarget(
      admin as never,
      account as never,
      settingsFixture({
        progression_mode: "automatic",
        progression_day: 10,
        progression_date: new Date().toISOString().slice(0, 10),
        progression_limit: 6,
        progression_review_required: false,
      }) as never,
    );

    expect(updates.filter((u) => u.payload.progression_mode === "automatic")).toHaveLength(0);
    expect(updates[0]?.payload.progression_limit).toBe(6);
  });
});
