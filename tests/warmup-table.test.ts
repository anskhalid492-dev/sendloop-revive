import { describe, expect, it } from "vitest";
import { latestSuccessfulWarmupActivity, warmupActivityLabel } from "@/lib/warmup-table";

describe("warmup activity elapsed time", () => {
  const now = new Date(2026, 9, 17, 12, 0).getTime();
  it.each([
    [20_000, "Just now"],
    [5 * 60_000, "5 min ago"],
    [3_600_000, "1 hour ago"],
    [2 * 3_600_000, "2 hours ago"],
    [86_400_000, "Yesterday"],
    [3 * 86_400_000, "3 days ago"],
  ])("formats elapsed milliseconds %s", (elapsed, expected) => {
    expect(warmupActivityLabel(new Date(now - elapsed).toISOString(), now)).toBe(expected);
  });
  it("does not invent activity from missing, invalid or future timestamps", () => {
    for (const timestamp of [null, "invalid", new Date(now + 60_000).toISOString()]) {
      expect(warmupActivityLabel(timestamp, now)).toBe("Not available");
    }
  });
});

describe("success-only warmup history (named throwaway fixtures, no network)", () => {
  it("reads each mailbox independently and ignores newer scheduled/failed/bounce events", async () => {
    const events = [
      { id: "warmup-table-test-a", type: "sent", occurred_at: "2026-10-17T10:00:00Z" },
      { id: "warmup-table-test-a", type: "delivered", occurred_at: "2026-10-17T10:05:00Z" },
      { id: "warmup-table-test-a", type: "scheduled", occurred_at: "2026-10-17T11:00:00Z" },
      { id: "warmup-table-test-a", type: "failed", occurred_at: "2026-10-17T11:01:00Z" },
      { id: "warmup-table-test-a", type: "bounced", occurred_at: "2026-10-17T11:02:00Z" },
      { id: "warmup-table-test-b", type: "replied", occurred_at: "2026-10-10T10:00:00Z" },
      { id: "warmup-table-test-c", type: "scheduled", occurred_at: "2026-10-17T11:00:00Z" },
    ];
    const client = {
      from(table: string) {
        expect(table).toBe("warmup_events");
        let id = "";
        let types: string[] = [];
        const builder = {
          select: () => builder,
          eq: (_column: string, value: string) => { id = value; return builder; },
          in: (_column: string, values: string[]) => { types = values; return builder; },
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => ({
            data: events.filter((e) => e.id === id && types.includes(e.type))
              .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] ?? null,
            error: null,
          }),
        };
        return builder;
      },
    };
    const result = await latestSuccessfulWarmupActivity(client as never, [
      "warmup-table-test-a", "warmup-table-test-b", "warmup-table-test-c",
    ]);
    expect(result.get("warmup-table-test-a")).toBe("2026-10-17T10:05:00Z");
    expect(result.get("warmup-table-test-b")).toBe("2026-10-10T10:00:00Z");
    expect(result.get("warmup-table-test-c")).toBeNull();
  });
  it("does not query unscoped history", async () => {
    const result = await latestSuccessfulWarmupActivity({ from: () => { throw new Error("Unscoped read"); } } as never, []);
    expect(result.size).toBe(0);
  });
});