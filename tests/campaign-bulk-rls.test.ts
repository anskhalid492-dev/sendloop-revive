import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_REASON,
  NOT_FOUND_REASON,
  partitionBulkTargets,
  type VisibleCampaign,
} from "../src/lib/campaign-bulk";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const mine = "11111111-1111-1111-1111-111111111111";
const theirs = "22222222-2222-2222-2222-222222222222";

function visibility(rows: VisibleCampaign[]) {
  return new Map(rows.map((r) => [r.id, r]));
}

describe("bulk campaign actions enforce workspace isolation", () => {
  it("keeps only campaigns from workspaces the caller belongs to", () => {
    const rows: VisibleCampaign[] = [
      { id: "a", workspace_id: mine, status: "active" },
      { id: "b", workspace_id: theirs, status: "active" },
    ];
    const result = partitionBulkTargets(
      ["a", "b"],
      "pause",
      visibility(rows),
      new Set([mine]),
    );
    expect(result.targets).toEqual(["a"]);
    expect(result.failed).toEqual([{ id: "b", reason: FORBIDDEN_REASON }]);
  });

  it("returns a clear error for ids RLS hides entirely", () => {
    const result = partitionBulkTargets(
      ["a", "ghost"],
      "archive",
      visibility([{ id: "a", workspace_id: mine, status: "active" }]),
      new Set([mine]),
    );
    expect(result.targets).toEqual(["a"]);
    expect(result.failed).toEqual([{ id: "ghost", reason: NOT_FOUND_REASON }]);
  });

  it("never mutates anything when the whole selection is foreign", () => {
    const result = partitionBulkTargets(
      ["b", "c"],
      "delete",
      visibility([
        { id: "b", workspace_id: theirs, status: "active" },
        { id: "c", workspace_id: theirs, status: "paused" },
      ]),
      new Set([mine]),
    );
    expect(result.targets).toEqual([]);
    expect(result.failed.every((f) => f.reason === FORBIDDEN_REASON)).toBe(true);
  });

  it("rejects pausing drafts while still allowing valid siblings", () => {
    const result = partitionBulkTargets(
      ["a", "d"],
      "pause",
      visibility([
        { id: "a", workspace_id: mine, status: "active" },
        { id: "d", workspace_id: mine, status: "draft" },
      ]),
      new Set([mine]),
    );
    expect(result.targets).toEqual(["a"]);
    expect(result.failed[0]?.reason).toContain("Draft");
  });
});

describe("bulk handler wiring", () => {
  const source = read("src/lib/campaigns.functions.ts");

  it("re-reads every id through the caller's RLS-scoped client", () => {
    expect(source).toContain("partitionBulkTargets");
    expect(source).toContain('rpc("is_workspace_member"');
    expect(source).not.toContain("client.server\")\n      .supabaseAdmin");
  });

  it("requires an authenticated caller", () => {
    const bulk = source.slice(source.indexOf("export const bulkCampaignAction"));
    expect(bulk.slice(0, 300)).toContain("requireSupabaseAuth");
  });
});
