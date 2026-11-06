import { describe, expect, it } from "vitest";

import { computeSubjectLineStats, SUBJECT_MIN_SAMPLE } from "@/lib/analytics-subject";
import type { Unit } from "@/lib/campaign-stats";

const FROM = new Date("2026-01-01T00:00:00Z");
const TO = new Date("2026-02-01T00:00:00Z");

function unit(over: Partial<Unit> & { leadKey: string; campaignId: string }): Unit {
  return {
    step: 1,
    status: "sent",
    accountId: "acc-1",
    variantId: null,
    deliveryStatus: "sent",
    sentAt: "2026-01-10T10:00:00Z",
    cancelledReason: null,
    cancelled: false,
    ...over,
    signals: {
      delivered_at: "2026-01-10T10:00:00Z",
      opened_at: null,
      clicked_at: null,
      replied_at: null,
      bounced_at: null,
      complained_at: null,
      unsubscribed_at: null,
      failed_at: null,
      ...(over.signals ?? {}),
    },
  } as Unit;
}

const names = new Map([
  ["c1", "Agency outreach"],
  ["c2", "SaaS founders"],
]);

const subjects: Record<string, string> = {
  "c1|1": "Quick question, {{first_name}}",
  "c1|2": "Following up",
  "c2|1": "Quick question, {{first_name}}",
};

function run(units: Unit[], opts: { trackingOff?: Set<string> } = {}) {
  return computeSubjectLineStats(units, {
    from: FROM,
    to: TO,
    campaignNames: names,
    ...(opts.trackingOff ? { trackingOff: opts.trackingOff } : {}),
    subjectFor: (u) =>
      u.variantId === "v1"
        ? "Variant subject for {{company}}"
        : (subjects[`${u.campaignId}|${u.step}`] ?? null),
  });
}

describe("subject line performance", () => {
  it("keeps personalisation variables and splits the same subject per campaign", () => {
    const rows = run([
      unit({ leadKey: "l1", campaignId: "c1" }),
      unit({ leadKey: "l2", campaignId: "c1" }),
      unit({ leadKey: "l3", campaignId: "c2" }),
    ]);
    const same = rows.filter((r) => r.subject === "Quick question, {{first_name}}");
    expect(same).toHaveLength(2);
    expect(same.map((r) => r.campaignName).sort()).toEqual(["Agency outreach", "SaaS founders"]);
    expect(rows.every((r) => !r.subject.includes("Sarah"))).toBe(true);
  });

  it("counts unique opens, not repeat opens, over delivered emails", () => {
    const rows = run([
      unit({ leadKey: "l1", campaignId: "c1", signals: { opened_at: "2026-01-11T09:00:00Z" } }),
      // Same person + step twice (a retry) is one logical email upstream; a
      // second row with the same open timestamp must not double the opens.
      unit({ leadKey: "l2", campaignId: "c1" }),
      unit({ leadKey: "l3", campaignId: "c1" }),
      unit({ leadKey: "l4", campaignId: "c1" }),
    ]);
    const row = rows.find((r) => r.campaignId === "c1" && r.steps.includes(1))!;
    expect(row.sent).toBe(4);
    expect(row.opens).toBe(1);
    expect(row.delivered).toBe(4);
  });

  it("excludes sends outside the date range", () => {
    const rows = run([
      unit({ leadKey: "l1", campaignId: "c1", sentAt: "2025-12-01T10:00:00Z" }),
      unit({ leadKey: "l2", campaignId: "c1" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sent).toBe(1);
  });

  it("flags small samples and drops delivered by bounces", () => {
    const rows = run([
      unit({
        leadKey: "l1",
        campaignId: "c1",
        signals: { bounced_at: "2026-01-11T09:00:00Z" },
      }),
      unit({ leadKey: "l2", campaignId: "c1" }),
    ]);
    const row = rows[0]!;
    expect(row.sent).toBe(2);
    expect(row.bounced).toBe(1);
    expect(row.delivered).toBe(1);
    expect(row.lowSample).toBe(true);
    expect(SUBJECT_MIN_SAMPLE).toBeGreaterThan(1);
  });

  it("does not flag a large sample", () => {
    const many = Array.from({ length: SUBJECT_MIN_SAMPLE + 5 }, (_, i) =>
      unit({ leadKey: `lead-${i}`, campaignId: "c1" }),
    );
    expect(run(many)[0]!.lowSample).toBe(false);
  });

  it("uses the variant subject when a variant was sent", () => {
    const rows = run([unit({ leadKey: "l1", campaignId: "c1", variantId: "v1" })]);
    expect(rows[0]!.subject).toBe("Variant subject for {{company}}");
  });

  it("skips units whose step has no subject and reports tracking-off campaigns", () => {
    const rows = run(
      [
        unit({ leadKey: "l1", campaignId: "c1", step: 9 }),
        unit({ leadKey: "l2", campaignId: "c2" }),
      ],
      { trackingOff: new Set(["c2"]) },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.campaignId).toBe("c2");
    expect(rows[0]!.openTracking).toBe(false);
  });
});
