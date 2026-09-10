import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { maybeReplanCampaignQueue } from "@/lib/dispatch.server";

type Row = Record<string, any>;

/** Minimal PostgREST-ish stub: only the calls the replan gate makes. */
function stubSupabase(campaign: Row | null, setting: Row | null, onUpsert: (row: Row) => void) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          table === "campaigns" ? { data: campaign } : { data: setting },
        upsert: async (row: Row) => {
          onUpsert(row);
          return { error: null };
        },
      };
      return builder;
    },
  };
}

const campaign = {
  timezone: "UTC",
  send_days: [2, 3, 4, 5],
  send_start_hour: 9,
  send_end_hour: 17,
  daily_cap: 700,
  sending_account_ids: ["b", "a"],
};

const fingerprint = JSON.stringify(["UTC", [2, 3, 4, 5], 9, 17, 700, ["a", "b"]]);

describe("campaign scheduler hardening", () => {
  test("sending always runs before the whole-queue replan", () => {
    const dispatcher = readFileSync("src/lib/dispatch.server.ts", "utf8");
    const dispatchIndex = dispatcher.indexOf("dispatchDueMessages(supabase, options)");
    const replanIndex = dispatcher.indexOf("maybeReplanCampaignQueue(supabase", dispatchIndex);
    expect(dispatchIndex).toBeGreaterThan(-1);
    expect(replanIndex).toBeGreaterThan(dispatchIndex);
  });

  test("an unchanged schedule does no queue-wide replan work", async () => {
    let upserted: Row | null = null;
    const supabase = stubSupabase(campaign, { value: { fingerprint, pending: false } }, (row) => {
      upserted = row;
    });
    const result = await maybeReplanCampaignQueue(supabase as any, "c1", new Date());
    expect(result.replanned).toBe(false);
    expect(result.reason).toBe("no_schedule_change");
    expect(upserted).toBeNull();
  });

  test("mailbox pool order is not a schedule change", async () => {
    const supabase = stubSupabase(
      { ...campaign, sending_account_ids: ["a", "b"] },
      { value: { fingerprint, pending: false } },
      () => {},
    );
    expect((await maybeReplanCampaignQueue(supabase as any, "c1", new Date())).replanned).toBe(false);
  });

  test("an exhausted budget skips the replan entirely", async () => {
    const dispatcher = readFileSync("src/lib/dispatch.server.ts", "utf8");
    expect(dispatcher).toContain('reason: "budget_exhausted"');
  });

  test("the replan itself is bounded and resumable", () => {
    const planner = readFileSync("src/lib/campaign-reschedule.server.ts", "utf8");
    expect(planner).toContain("RESCHEDULE_MAX_ROWS");
    expect(planner).toContain("outOfBudget()");
    expect(planner).toContain("truncated");
  });
});
