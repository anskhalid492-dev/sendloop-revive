import { describe, expect, it } from "vitest";
import { applySavedMailboxesToReadiness, type LaunchReadiness } from "@/lib/campaign-launch-model";

const base = (issues: LaunchReadiness["issues"]): LaunchReadiness => ({
  ready: issues.length === 0, issues, campaignId: "c", workspaceId: "w", listId: "l", listName: "L",
  eligible: 10, alreadyQueued: 0, audience: 10, unassignedLeads: 0, activeMailboxes: 0,
});
const accts = ["a", "b", "c", "d"].map((id) => ({ id, status: "verified", customer_enabled: true, paused: false }));

describe("saved mailbox selection updates launch readiness", () => {
  it("4/4 selected enables launch", () => {
    const r = applySavedMailboxesToReadiness(base([{ code: "no_mailbox", message: "x" }]), ["a", "b", "c", "d"], accts);
    expect(r.ready).toBe(true);
    expect(r.activeMailboxes).toBe(4);
  });
  it("1/4 selected is enough", () => {
    expect(applySavedMailboxesToReadiness(base([{ code: "no_mailbox", message: "x" }]), ["a"], accts).ready).toBe(true);
  });
  it("deselect all disables launch", () => {
    const r = applySavedMailboxesToReadiness(base([]), [], accts);
    expect(r.ready).toBe(false);
    expect(r.issues[0]!.code).toBe("no_mailbox");
  });
  it("paused-only selection stays blocked", () => {
    const r = applySavedMailboxesToReadiness(base([]), ["p"], [{ id: "p", status: "verified", customer_enabled: true, paused: true }]);
    expect(r.ready).toBe(false);
  });
  it("never clears non-mailbox issues", () => {
    const r = applySavedMailboxesToReadiness(base([{ code: "no_mailbox", message: "x" }, { code: "list_empty", message: "y" }]), ["a"], accts);
    expect(r.ready).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(["list_empty"]);
  });
});
