import { describe, expect, it } from "vitest";
import { groupRecipientPatches } from "@/lib/recipient-status-batch";

describe("groupRecipientPatches", () => {
  it("groups identical patches into one batch", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      patch: { status: "in_progress", current_step: 1, next_send_at: null },
    }));
    const batches = groupRecipientPatches(entries);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.ids).toHaveLength(5);
  });

  it("keeps per-recipient outcomes separate when patches differ", () => {
    const batches = groupRecipientPatches([
      { id: "a", patch: { status: "in_progress", current_step: 1 } },
      { id: "b", patch: { status: "in_progress", current_step: 2 } },
      { id: "c", patch: { status: "completed", current_step: 2 } },
    ]);
    expect(batches).toHaveLength(3);
    expect(new Set(batches.flatMap((b) => b.ids))).toEqual(new Set(["a", "b", "c"]));
  });

  it("chunks a large group at the requested size", () => {
    const entries = Array.from({ length: 230 }, (_, i) => ({
      id: `r${i}`,
      patch: { status: "in_progress" },
    }));
    const batches = groupRecipientPatches(entries, 100);
    expect(batches.map((b) => b.ids.length)).toEqual([100, 100, 30]);
    expect(new Set(batches.flatMap((b) => b.ids)).size).toBe(230);
  });

  it("key order does not split a group, and the newest patch per recipient wins", () => {
    const batches = groupRecipientPatches([
      { id: "a", patch: { status: "in_progress", current_step: 1 } },
      { id: "b", patch: { current_step: 1, status: "in_progress" } },
      { id: "a", patch: { status: "in_progress", current_step: 1 } },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.ids.sort()).toEqual(["a", "b"]);
  });
});
