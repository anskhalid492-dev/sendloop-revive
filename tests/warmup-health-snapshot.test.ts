import { describe, expect, it } from "vitest";
import { isSameHealthSnapshot } from "@/lib/warmup-health-snapshot";

const snap = { score: 80, status: "good", factors: [{ key: "spf", ok: true }], recommendation: "Hold" };

describe("warmup health history writes", () => {
  it("writes the first snapshot", () => expect(isSameHealthSnapshot(null, snap)).toBe(false));
  it("skips an identical recalculation", () => expect(isSameHealthSnapshot({ ...snap }, snap)).toBe(true));
  it("writes when the score changes", () => expect(isSameHealthSnapshot({ ...snap, score: 79 }, snap)).toBe(false));
  it("writes when the status changes", () => expect(isSameHealthSnapshot({ ...snap, status: "warning" }, snap)).toBe(false));
  it("writes when factors change", () =>
    expect(isSameHealthSnapshot({ ...snap, factors: [{ key: "spf", ok: false }] }, snap)).toBe(false));
});

describe("factors comparison ignores stored key order", () => {
  it("treats reordered keys (as jsonb returns them) as unchanged", () => {
    const stored = { ...snap, factors: [{ ok: true, key: "spf" }] };
    expect(isSameHealthSnapshot(stored, snap)).toBe(true);
  });
  it("still detects a changed value inside reordered factors", () => {
    const stored = { ...snap, factors: [{ ok: false, key: "spf" }] };
    expect(isSameHealthSnapshot(stored, snap)).toBe(false);
  });
  it("treats factor order in the list as a change", () => {
    const two = { ...snap, factors: [{ key: "a" }, { key: "b" }] };
    expect(isSameHealthSnapshot({ ...two, factors: [{ key: "b" }, { key: "a" }] }, two)).toBe(false);
  });
});
