import { describe, expect, it } from "vitest";

import { aggregateAiMonitoring } from "@/lib/sales-agent-metrics";
import { MONITORING_MAX_ROWS, loadMonitoringRows } from "@/lib/sales-agent-monitoring.server";
import { monitoringView } from "@/lib/sales-agent-monitoring-view";
import { presetRange } from "@/lib/warmup-analytics";

const WS = "11111111-1111-4111-8111-111111111111";

function fakeDb(pages: (n: number) => { data: unknown[] | null; error: unknown }) {
  const calls: Record<string, unknown>[] = [];
  let n = 0;
  return {
    calls,
    db: {
      from: (table: string) => {
        const q: Record<string, unknown> = { table };
        const b = {
          select: () => b,
          gte: (c: string, v: string) => ((q["gte"] = [c, v]), b),
          lt: (c: string, v: string) => ((q["lt"] = [c, v]), b),
          or: () => b,
          order: (c: string) => ((q["order"] = c), b),
          range: async () => (calls.push(q), pages(n++)),
        };
        return b;
      },
    },
  };
}

describe("admin AI Sales Agent monitoring — loading fix", () => {
  it("filters and orders on started_at (the table has no created_at)", async () => {
    const f = fakeDb(() => ({ data: [], error: null }));
    await loadMonitoringRows(f.db, "2026-10-01", "2026-10-03");
    expect(f.calls[0]!["gte"]).toEqual(["started_at", "2026-10-01T00:00:00.000Z"]);
    expect(f.calls[0]!["lt"]).toEqual(["started_at", "2026-10-04T00:00:00.000Z"]);
    expect(f.calls[0]!["order"]).toBe("started_at");
  });

  it("zero usage returns a complete, predictable empty shape", async () => {
    const f = fakeDb(() => ({ data: [], error: null }));
    const { rows, truncated } = await loadMonitoringRows(f.db, "2026-09-04", "2026-10-03");
    const m = aggregateAiMonitoring(rows);
    expect(truncated).toBe(false);
    expect(m.totals.requests).toBe(0);
    expect(m.totals.success).toBe(0);
    expect(m.totals.failed).toBe(0);
    expect(m.totals.timedOut).toBe(0);
    expect(m.totals.avgLatencyMs).toBeNull();
    expect(m.totals.totalTokens).toBe(0);
    expect(m.outcomes).toEqual([]);
    expect(m.workspaces).toEqual([]);
    expect(m.failures.every((x) => x.count === 0)).toBe(true);
  });

  it("a database error is thrown as a safe message (no details leak)", async () => {
    const f = fakeDb(() => ({ data: null, error: { message: "column x does not exist", code: "42703" } }));
    await expect(loadMonitoringRows(f.db, "2026-10-01", "2026-10-03")).rejects.toThrow("Could not load AI Sales Agent metrics.");
  });

  it("keeps the 20,000-step cap and flags truncation", async () => {
    const full = Array.from({ length: 1000 }, () => ({ workspace_id: WS, output: {} }));
    const f = fakeDb(() => ({ data: full, error: null }));
    const out = await loadMonitoringRows(f.db, "2026-01-01", "2026-10-03");
    expect(out.rows.length).toBe(MONITORING_MAX_ROWS);
    expect(out.truncated).toBe(true);
  });

  it("every date preset produces a valid range", () => {
    for (const p of ["today", "last7", "last30", "this_month"] as const) {
      const r = presetRange(p, "2026-10-03");
      expect(r.from <= r.to).toBe(true);
    }
  });

  it("view state always resolves: loading → ready, loading → error, error → retry → ready", () => {
    expect(monitoringView({ invalid: false, isError: false, hasData: false })).toBe("loading");
    expect(monitoringView({ invalid: false, isError: false, hasData: true })).toBe("ready");
    expect(monitoringView({ invalid: false, isError: true, hasData: false, errorMessage: "Could not load" })).toBe("error");
    expect(monitoringView({ invalid: false, isError: false, hasData: true })).toBe("ready");
  });

  it("authorization failures show access denied, invalid ranges never stay loading", () => {
    expect(monitoringView({ invalid: false, isError: true, hasData: false, errorMessage: "Forbidden: super admin role required" })).toBe("denied");
    expect(monitoringView({ invalid: false, isError: true, hasData: false, errorMessage: "Two-factor authentication is required" })).toBe("denied");
    expect(monitoringView({ invalid: true, isError: false, hasData: false })).toBe("invalid");
  });
});
