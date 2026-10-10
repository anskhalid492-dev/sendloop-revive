import { describe, it, expect } from "vitest";
import { syncLeadReplySentiment } from "@/lib/positive-reply-sentiment.server";

describe("manual reply classification correction", () => {
  function client(fail = false) {
    const filters: unknown[][] = [];
    const rows: unknown[] = [];
    return { filters, rows, db: { from(table: string) {
      const chain = {
        select() { return chain; }, eq(...args: unknown[]) { filters.push(args); return chain; }, neq() { return chain; },
        update(row: unknown) { rows.push(row); return chain; }, maybeSingle() { return chain; },
        then(resolve: (value: unknown) => unknown) { return resolve(table === "leads" ? { data: { workspace_id: "throwaway-workspace" }, error: null } : { error: fail ? { message: "temporary failure" } : null }); },
      }; return chain;
    } } };
  }
  it("scopes human corrections to the verified lead workspace", async () => {
    const f = client(); await syncLeadReplySentiment(f.db, "throwaway-lead", "interested");
    expect(f.rows).toEqual([{ sentiment: "positive" }]);
    expect(f.filters).toContainEqual(["workspace_id", "throwaway-workspace"]);
  });
  it("does not silently report success when a correction fails", async () => {
    const f = client(true);
    await expect(syncLeadReplySentiment(f.db, "throwaway-lead", "not_interested")).rejects.toThrow("please retry");
  });
  it("can correct a positive reply to neutral", async () => {
    const f = client(); await syncLeadReplySentiment(f.db, "throwaway-lead", "lead");
    expect(f.rows).toEqual([{ sentiment: "neutral" }]);
  });
});