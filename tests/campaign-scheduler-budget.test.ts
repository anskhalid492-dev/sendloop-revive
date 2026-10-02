import { describe, expect, it } from "vitest";
import {
  hasBudgetRemaining,
  isLeaseHeld,
  orderCampaignsForRun,
} from "../src/lib/campaign-scheduler";
import { runCampaignScheduler } from "../src/lib/campaign-scheduler.server";

function fakeSupabase() {
  const settings = new Map<string, unknown>();
  const client = {
    settings,
    from(table: string) {
      if (table !== "platform_settings") throw new Error(`unexpected table ${table}`);
      let key = "";
      const builder: any = {
        select: () => builder,
        eq: (_col: string, value: string) => {
          key = value;
          return builder;
        },
        maybeSingle: async () => ({ data: settings.has(key) ? { value: settings.get(key) } : null }),
        or: () => builder,
        update: (value: { value: { expiresAt?: string; token?: string } }) => {
          const u: any = {
            eq: (col: string, v: string) => {
              if (col === "key") key = v;
              return u;
            },
            or: () => u,
            select: async () => {
              const cur = settings.get(key) as { expiresAt?: string } | undefined;
              if (!cur || (cur.expiresAt && new Date(cur.expiresAt).getTime() > Date.now())) return { data: [], error: null };
              settings.set(key, value.value);
              return { data: [{ key }], error: null };
            },
            then: (res: any) => {
              settings.set(key, value.value);
              res({ error: null });
            },
          };
          return u;
        },
        upsert: (row: { key: string; value: unknown }) => ({
          select: async () => {
            if (settings.has(row.key)) return { data: [], error: null };
            settings.set(row.key, row.value);
            return { data: [{ key: row.key }], error: null };
          },
        }),
        upsert: async (row: { key: string; value: unknown }) => {
          settings.set(row.key, row.value);
          return { error: null };
        },
      };
      return builder;
    },
  };
  return client as any;
}

const ok = { sent: 1, failed: 0, scheduled: 0 };

describe("scheduler helpers", () => {
  it("detects a held lease and ignores an expired one", () => {
    const now = new Date("2026-08-28T20:00:00Z");
    expect(isLeaseHeld({ token: "a", expiresAt: "2026-08-28T20:00:30Z" }, now)).toBe(true);
    expect(isLeaseHeld({ token: "a", expiresAt: "2026-08-28T19:59:00Z" }, now)).toBe(false);
    expect(isLeaseHeld(null, now)).toBe(false);
  });

  it("resumes after the cursor campaign", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderCampaignsForRun(list, "a").map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(orderCampaignsForRun(list, null).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(orderCampaignsForRun(list, "zz").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("stops starting work once the budget is spent", () => {
    expect(hasBudgetRemaining(0, 19_000, 20_000)).toBe(true);
    expect(hasBudgetRemaining(0, 21_000, 20_000)).toBe(false);
  });
});

describe("runCampaignScheduler", () => {
  it("stops within budget and continues on the next invocation", async () => {
    const supabase = fakeSupabase();
    const campaigns = [{ id: "a" }, { id: "b" }, { id: "c" }];
    let clock = 0;
    const deps = {
      now: () => new Date(clock),
      budgetMs: 1_000,
      runCampaign: async (id: string) => {
        clock += 600; // each campaign takes longer than half the budget
        void id;
        return ok;
      },
      recover: async () => 0,
    };

    const first = await runCampaignScheduler(supabase, campaigns, deps);
    expect(first.results.map((r) => r.id)).toEqual(["a", "b"]);
    expect(first.budgetExhausted).toBe(true);

    clock = 0;
    const second = await runCampaignScheduler(supabase, campaigns, deps);
    // continues after the cursor instead of restarting at the head of the queue
    expect(second.results.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("skips overlapping invocations so a slow run cannot double-send", async () => {
    const supabase = fakeSupabase();
    supabase.settings.set("campaign_scheduler_lease", {
      token: "other",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    });
    let calls = 0;
    const result = await runCampaignScheduler(supabase, [{ id: "a" }], {
      runCampaign: async () => {
        calls += 1;
        return ok;
      },
      recover: async () => 0,
    });
    expect(result.skipped).toBe("locked");
    expect(calls).toBe(0);
  });

  it("releases the lease so the next cron tick can run even after a long invocation", async () => {
    const supabase = fakeSupabase();
    const deps = {
      budgetMs: 50,
      runCampaign: async () => ok,
      recover: async () => 0,
    };
    await runCampaignScheduler(supabase, [{ id: "a" }], deps);
    const second = await runCampaignScheduler(supabase, [{ id: "a" }], deps);
    expect(second.skipped).toBeUndefined();
    expect(second.results.map((r) => r.id)).toEqual(["a"]);
  });

  it("recovers interrupted messages before dispatching", async () => {
    const supabase = fakeSupabase();
    const order: string[] = [];
    const result = await runCampaignScheduler(supabase, [{ id: "a" }], {
      recover: async () => {
        order.push("recover");
        return 2;
      },
      runCampaign: async () => {
        order.push("run");
        return ok;
      },
    });
    expect(order).toEqual(["recover", "run"]);
    expect(result.recovered).toBe(2);
  });

  it("keeps going when one campaign throws", async () => {
    const supabase = fakeSupabase();
    const result = await runCampaignScheduler(supabase, [{ id: "a" }, { id: "b" }], {
      recover: async () => 0,
      runCampaign: async (id: string) => {
        if (id === "a") throw new Error("boom");
        return ok;
      },
    });
    expect(result.results).toEqual([
      { id: "a", sent: 0, failed: 1, scheduled: 0 },
      { id: "b", sent: 1, failed: 0, scheduled: 0 },
    ]);
  });
});
