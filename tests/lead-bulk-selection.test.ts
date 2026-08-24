import { describe, expect, it } from "vitest";

import {
  EMPTY_SELECTION,
  isSelected,
  selectionCount,
  toggleSelection,
  type LeadSelection,
} from "@/lib/leads-query";
import { resolveSelectionIds } from "@/lib/leads-bulk.server";

/** Fake PostgREST builder that pages a fixed dataset, 1000 rows max per call. */
function fakeClient(ids: string[]) {
  return {
    from() {
      const state: { in?: string[]; range?: [number, number] } = {};
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        contains: () => builder,
        ilike: () => builder,
        gte: () => builder,
        lte: () => builder,
        or: () => builder,
        order: () => builder,
        in: (_c: string, values: string[]) => {
          state.in = values;
          return builder;
        },
        range: (from: number, to: number) => {
          state.range = [from, to];
          return builder.then();
        },
        then(resolve?: (v: unknown) => unknown) {
          const pool = state.in ? ids.filter((id) => state.in!.includes(id)) : ids;
          const [from, to] = state.range ?? [0, pool.length - 1];
          const rows = pool.slice(from, to + 1).map((id) => ({ id }));
          const result = { data: rows, error: null };
          return Promise.resolve(resolve ? resolve(result) : result);
        },
      };
      return builder;
    },
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `lead-${i}`);

describe("lead selection model", () => {
  it("counts an explicit page selection", () => {
    let s: LeadSelection = EMPTY_SELECTION;
    s = toggleSelection(s, "a", true);
    s = toggleSelection(s, "b", true);
    expect(selectionCount(s, 1000)).toBe(2);
  });

  it("counts every matching lead in select-all mode", () => {
    const s: LeadSelection = { mode: "all", excluded: [] };
    expect(selectionCount(s, 1000)).toBe(1000);
    expect(isSelected(s, "anything")).toBe(true);
  });

  it("subtracts de-selected rows from select-all", () => {
    const s = toggleSelection({ mode: "all", excluded: [] }, "lead-3", false);
    expect(selectionCount(s, 1000)).toBe(999);
    expect(isSelected(s, "lead-3")).toBe(false);
  });
});

describe("resolveSelectionIds", () => {
  for (const size of [50, 100, 500, 1000, 10_000]) {
    it(`resolves all ${size} matching leads across pages`, async () => {
      const resolved = await resolveSelectionIds(
        fakeClient(ids(size)) as never,
        { workspaceId: "ws" },
        { mode: "all", excluded: [] },
      );
      expect(resolved).toHaveLength(size);
    });
  }

  it("honours exclusions in select-all", async () => {
    const resolved = await resolveSelectionIds(
      fakeClient(ids(1200)) as never,
      { workspaceId: "ws" },
      { mode: "all", excluded: ["lead-0", "lead-1100"] },
    );
    expect(resolved).toHaveLength(1198);
    expect(resolved).not.toContain("lead-1100");
  });

  it("drops ids the caller cannot see", async () => {
    const resolved = await resolveSelectionIds(
      fakeClient(ids(10)) as never,
      { workspaceId: "ws" },
      { mode: "ids", ids: ["lead-1", "lead-2", "other-workspace-lead"] },
    );
    expect(resolved.sort()).toEqual(["lead-1", "lead-2"]);
  });

  it("returns nothing for an empty selection", async () => {
    expect(
      await resolveSelectionIds(fakeClient(ids(10)) as never, {}, EMPTY_SELECTION),
    ).toEqual([]);
  });
});
