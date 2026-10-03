import { describe, expect, it } from "vitest";
import { buildSeries, deliveryRate, formatRate, groupTotals, paginate, presetRange, totalsOf, weekStart, type StatRow } from "@/lib/warmup-analytics";

const r = (a: string, w: string, day: string, sent: number, delivered = 0, failed = 0, bounced = 0): StatRow =>
  ({ sending_account_id: a, workspace_id: w, day, sent, delivered, failed, bounced });

describe("warmup analytics", () => {
  it("date presets", () => {
    const t = "2026-10-03";
    expect(presetRange("today", t)).toEqual({ from: t, to: t });
    expect(presetRange("yesterday", t)).toEqual({ from: "2026-10-02", to: "2026-10-02" });
    expect(presetRange("last7", t)).toEqual({ from: "2026-09-27", to: t });
    expect(presetRange("last30", t)).toEqual({ from: "2026-09-04", to: t });
    expect(presetRange("this_month", t)).toEqual({ from: "2026-10-01", to: t });
    expect(presetRange("last_month", t)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(weekStart("2026-10-03")).toBe("2026-09-28");
  });
  it("delivery rate is safe at zero", () => {
    expect(deliveryRate(0, 0)).toBeNull();
    expect(formatRate(null)).toBe("—");
    expect(deliveryRate(975, 1000)).toBe(97.5);
  });
  it("totals count failed + bounced, group per workspace and mailbox", () => {
    const rows = [r("a", "w1", "2026-10-01", 10, 9, 1), r("b", "w1", "2026-10-01", 5, 4, 0, 1), r("c", "w2", "2026-10-02", 3, 3)];
    expect(totalsOf(rows)).toEqual({ sent: 18, delivered: 16, failed: 2, deliveryRate: 88.9 });
    const ws = groupTotals(rows, (x) => x.workspace_id);
    expect(ws.get("w1")?.sent).toBe(15);
    expect(ws.get("w2")?.sent).toBe(3);
    expect(groupTotals(rows, (x) => x.sending_account_id).get("b")?.failed).toBe(1);
  });
  it("series: daily ≤62 days, weekly beyond, ignores out-of-range rows", () => {
    const d = buildSeries([r("a", "w", "2026-10-02", 4), r("a", "w", "2026-11-30", 9)], "2026-10-01", "2026-10-03");
    expect(d.grouping).toBe("day");
    expect(d.points.map((p) => p.sent)).toEqual([0, 4, 0]);
    const w = buildSeries([r("a", "w", "2026-01-07", 2), r("a", "w", "2026-01-08", 3)], "2026-01-01", "2026-06-30");
    expect(w.grouping).toBe("week");
    expect(w.points.find((p) => p.bucket === "2026-01-05")?.sent).toBe(5);
  });
  it("pagination", () => {
    const p = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(p).toMatchObject({ rows: [3, 4], total: 5, pages: 3, page: 2 });
    expect(paginate([], 1, 20)).toMatchObject({ total: 0, pages: 1, rows: [] });
  });
});
