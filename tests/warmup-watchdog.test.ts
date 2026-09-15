import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const watchdog = readFileSync("src/lib/warmup-watchdog.server.ts", "utf8");
const cron = readFileSync("src/routes/api/public/cron/retry-inbound.ts", "utf8");
const engine = readFileSync("src/lib/warmup-engine.server.ts", "utf8");

describe("warmup watchdog", () => {
  it("only runs a catch-up cycle when the dispatcher is stale", () => {
    expect(watchdog).toContain("WARMUP_STALE_MS");
    expect(watchdog).toContain('reason: "recent run"');
    expect(watchdog).toContain("runWarmupCycle");
  });

  it("never runs while the runner is paused", () => {
    expect(watchdog).toMatch(/state\?\.paused[\s\S]*ran: false/);
  });

  it("flags mailboxes warming over 24h with zero sends", () => {
    expect(watchdog).toContain("24 * 60 * 60 * 1000");
    expect(watchdog).toContain('.eq("warmup_status", "warming")');
    expect(watchdog).toContain('.in("status", ["sent", "delivered"])');
    expect(watchdog).toContain("warmup_stall_check");
  });

  it("is wired into a schedule that fires every minute", () => {
    expect(cron).toContain("ensureWarmupTick");
    expect(cron).toContain("checkStalledWarmupAccounts");
  });

  it("does not abort a dispatch cycle on event-type constraint drift", () => {
    expect(engine).toContain('error.code === "23514"');
  });
});
