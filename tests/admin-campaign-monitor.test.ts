import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  addClass,
  allowedActions,
  classifyMessage,
  dailySeries,
  deriveRates,
  emptyTotals,
  paginate,
  smtpCode,
  sortRows,
  sumKpis,
  weekTrend,
} from "@/lib/admin-campaign-monitor";

const base = { leads: 0, opens: 0, clicks: 0, replies: 0, positiveReplies: 0, unsubscribes: 0 };

describe("message classification", () => {
  it("separates sent, bounced, failed and unknown", () => {
    expect(classifyMessage({ status: "sent" })).toBe("sent");
    expect(classifyMessage({ status: "sent", bounced_at: "2026-10-01" })).toBe("sent_bounced");
    expect(classifyMessage({ status: "failed", bounced_at: "2026-10-01" })).toBe("bounced_rejected");
    expect(classifyMessage({ status: "failed" })).toBe("failed");
    expect(classifyMessage({ status: "sent" }, { bounceEvent: true })).toBe("sent_bounced");
  });

  it("never counts an unknown outcome as sent, failed or bounced", () => {
    const t = emptyTotals();
    addClass(t, classifyMessage({ status: "failed" }, { unknown: true }));
    expect(t).toEqual({ sent: 0, bounced: 0, bouncedAfterSend: 0, failed: 0, unknown: 1 });
  });
});

describe("rates", () => {
  it("delivery uses explicit receipts, separate from reachable engagement base", () => {
    const r = deriveRates({ ...base, sent: 100, bounced: 7, bouncedAfterSend: 5, failed: 3, unknown: 1, delivered: 95, opens: 19, replies: 4 });
    expect(r.delivered).toBe(95);
    expect(r.deliveryRate).toBe(95);
    expect(r.openRate).toBe(20); // 19 / 95
    expect(r.bounceRate).toBe(6.9); // 7 / (100 + 2 rejected)
  });

  it("shows no rate (null) when nothing was sent", () => {
    const r = deriveRates({ ...base, ...emptyTotals() });
    expect(r.deliveryRate).toBeNull();
    expect(r.openRate).toBeNull();
    expect(r.replyRate).toBeNull();
    expect(r.bounceRate).toBeNull();
  });

  it("sums KPI cards and status counts", () => {
    const row = (status: string, sent: number) => ({ ...base, ...emptyTotals(), status, sent, replies: 1 });
    const k = sumKpis([row("active", 10), row("paused", 10), row("completed", 0)]);
    expect(k.campaigns).toBe(3);
    expect(k.active).toBe(1);
    expect(k.paused).toBe(1);
    expect(k.completed).toBe(1);
    expect(k.sent).toBe(20);
    expect(k.replyRate).toBe(15);
  });
});

describe("trends", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("returns null without previous-week data instead of inventing a comparison", () => {
    expect(weekTrend(["2026-10-14T00:00:00Z"], now)).toBeNull();
  });
  it("compares the last 7 days with the 7 before", () => {
    const t = weekTrend(["2026-10-14T00:00:00Z", "2026-10-13T00:00:00Z", "2026-10-05T00:00:00Z"], now);
    expect(t).toEqual({ current: 2, previous: 1, changePct: 100 });
  });
  it("buckets daily volume", () => {
    const s = dailySeries([{ at: "2026-10-15T01:00:00Z", kind: "sent" }, { at: "2026-10-14T01:00:00Z", kind: "failed" }], 3, now);
    expect(s.map((d) => d.day)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(s[2]!.sent).toBe(1);
    expect(s[1]!.failed).toBe(1);
  });
});

describe("table helpers", () => {
  it("sorts with empty values last", () => {
    const rows = [{ v: 2 }, { v: null }, { v: 5 }];
    expect(sortRows(rows, "v", "desc").map((r) => r.v)).toEqual([5, 2, null]);
    expect(sortRows(rows, "v", "asc").map((r) => r.v)).toEqual([2, 5, null]);
  });
  it("paginates and clamps", () => {
    const p = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(p.page).toBe(3);
    expect(p.rows).toEqual([5]);
  });
  it("extracts SMTP codes", () => {
    expect(smtpCode("550 5.7.193 rejected")).toBe("550 5.7.193");
    expect(smtpCode("421 try later")).toBe("421");
    expect(smtpCode("timeout")).toBeNull();
  });
});

describe("admin actions", () => {
  it("only offers valid state changes", () => {
    expect(allowedActions("active")).toEqual(["pause", "stop"]);
    expect(allowedActions("paused")).toEqual(["resume", "stop"]);
    expect(allowedActions("completed")).toEqual([]);
    expect(allowedActions("draft")).toEqual([]);
  });

  it("every admin campaign server function checks the super-admin role", () => {
    const src = readFileSync("src/lib/admin-outreach.functions.ts", "utf8");
    for (const fn of ["adminListCampaigns", "adminGetCampaign", "adminGetCampaignInsights", "adminCampaignControl"]) {
      const body = src.slice(src.indexOf(`export const ${fn} `)).split("export const ")[1]!;
      expect(body).toContain("requireSupabaseAuth");
      expect(body).toContain("assertSuperAdmin");
    }
  });

  it("campaign control changes status only and never dispatches a send", () => {
    const src = readFileSync("src/lib/admin-outreach.server.ts", "utf8");
    const start = src.indexOf("export async function adminCampaignAction(");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).not.toMatch(/dispatch|sendEmail|sendCampaign|run_campaign_scheduler/);
    expect(body).toContain('.in("status", ["pending", "scheduled"])');
  });
});
