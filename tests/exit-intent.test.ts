import { describe, expect, it, vi } from "vitest";
import { shouldShowExitIntent } from "@/components/site/exit-intent";

const eligible = { enabled: true, finePointer: true, elapsedMs: 8_000, interacted: true, leavingTop: true, pageVisible: true, anotherDialogOpen: false };

describe("public exit-intent safeguards (isolated visitor, no database)", () => {
  it("allows a desktop top-edge exit after engagement", () => {
    expect(shouldShowExitIntent(eligible)).toBe(true);
  });
  it("does not show immediately on page load", () => {
    expect(shouldShowExitIntent({ ...eligible, elapsedMs: 0 })).toBe(false);
  });
  it("waits for the complete delay", () => {
    expect(shouldShowExitIntent({ ...eligible, elapsedMs: 7_999 })).toBe(false);
  });
  it("excludes signed-in or unresolved visitors", () => {
    expect(shouldShowExitIntent({ ...eligible, enabled: false })).toBe(false);
  });
  it("avoids touch/mobile exit-intent heuristics", () => {
    expect(shouldShowExitIntent({ ...eligible, finePointer: false })).toBe(false);
  });
  it("requires visitor interaction", () => {
    expect(shouldShowExitIntent({ ...eligible, interacted: false })).toBe(false);
  });
  it("ignores side exits and movement within the page", () => {
    expect(shouldShowExitIntent({ ...eligible, leavingTop: false })).toBe(false);
  });
  it("does not trigger when the tab is hidden", () => {
    expect(shouldShowExitIntent({ ...eligible, pageVisible: false })).toBe(false);
  });
  it("does not stack over an existing dialog", () => {
    expect(shouldShowExitIntent({ ...eligible, anotherDialogOpen: true })).toBe(false);
  });
  it("claims only once across repeated mounts", async () => {
    vi.resetModules();
    const { claimExitIntentSession } = await import("@/components/site/exit-intent");
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(claimExitIntentSession(storage)).toBe(true);
    expect(claimExitIntentSession(storage)).toBe(false);
  });
  it("honors an existing session after reload", async () => {
    vi.resetModules();
    const { claimExitIntentSession } = await import("@/components/site/exit-intent");
    expect(claimExitIntentSession({ getItem: () => "1", setItem: () => { throw new Error("must not write"); } })).toBe(false);
  });
  it("still suppresses repeats when browser storage is blocked", async () => {
    vi.resetModules();
    const { claimExitIntentSession } = await import("@/components/site/exit-intent");
    const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
    expect(claimExitIntentSession(storage)).toBe(true);
    expect(claimExitIntentSession(storage)).toBe(false);
  });
});