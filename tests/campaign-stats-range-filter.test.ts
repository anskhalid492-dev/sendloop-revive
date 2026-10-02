import { describe, expect, it } from "vitest";

import { fetchCampaignStats } from "@/lib/campaign-stats.server";

type Call = { table: string; filters: string[] };

/** Minimal PostgREST-shaped stub that records the filters each query applies. */
function stubClient(calls: Call[]) {
  const builder = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const rows =
      table === "campaigns" ? [{ id: "c1", name: "C1", status: "active" }] : ([] as unknown[]);
    const api: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      call.filters.push(`${name}:${args.map((a) => String(a)).join("|")}`);
      return api;
    };
    for (const m of ["select", "eq", "in", "not", "order", "gte", "lt", "or", "is"]) {
      api[m] = chain(m);
    }
    api["range"] = (from: number) =>
      Promise.resolve({ data: from === 0 ? rows : [], error: null });
    api["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return api;
  };
  return { from: (table: string) => builder(table) };
}

describe("fetchCampaignStats range filters", () => {
  it("pushes the reporting window into the database queries", async () => {
    const calls: Call[] = [];
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-09-01T00:00:00.000Z");

    await fetchCampaignStats(stubClient(calls) as never, {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      campaignIds: [`range-guard-${Date.now()}`],
      from,
      to,
    });

    const messageCalls = calls.filter((c) => c.table === "campaign_messages");
    const events = calls.find((c) => c.table === "email_engagement_events");
    const replies = calls.find((c) => c.table === "campaign_replies");

    // Four indexable window reads replace one unindexable OR.
    expect(messageCalls.some((c) => c.filters.includes("gte:sent_at|2026-08-01T00:00:00.000Z"))).toBe(true);
    expect(messageCalls.some((c) => c.filters.includes("gte:updated_at|2026-08-01T00:00:00.000Z"))).toBe(true);
    expect(messageCalls.some((c) => c.filters.some((f) => f.startsWith("is:sent_at")))).toBe(true);
    expect(messageCalls.every((c) => !c.filters.some((f) => f.startsWith("or:")))).toBe(true);
    expect(events?.filters.some((f) => f.startsWith("gte:occurred_at"))).toBe(true);
    expect(events?.filters.some((f) => f.startsWith("lt:occurred_at"))).toBe(true);
    expect(replies?.filters.some((f) => f.startsWith("gte:received_at"))).toBe(true);
  });
});
