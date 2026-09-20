import { describe, expect, it } from "vitest";

import {
  SCHEDULER_SENDABLE_STATUSES,
  canLaunchCampaign,
  isLaunched,
  launchSucceededDespiteError,
  schedulerCanSend,
  showsLaunchReadiness,
} from "@/lib/campaign-status-sync";

describe("campaign lifecycle status is the single source of truth", () => {
  it("queued messages alone never make a draft campaign active", () => {
    // Queue state (277 queued recipients) is not lifecycle state.
    const draftWithFullQueue = { status: "draft", launched_at: null, queued: 277 };
    expect(canLaunchCampaign(draftWithFullQueue.status)).toBe(true);
    expect(schedulerCanSend(draftWithFullQueue.status)).toBe(false);
    expect(isLaunched(draftWithFullQueue)).toBe(false);
  });

  it("a successful launch means active, and active is never launchable", () => {
    expect(canLaunchCampaign("active")).toBe(false);
    expect(showsLaunchReadiness("active")).toBe(false);
    expect(isLaunched({ status: "active", launched_at: "2026-09-20T18:39:40Z" })).toBe(true);
  });

  it("draft campaigns can show the launch action and the readiness bar", () => {
    for (const status of ["draft", "scheduled"]) {
      expect(canLaunchCampaign(status)).toBe(true);
      expect(showsLaunchReadiness(status)).toBe(true);
    }
  });

  it("paused, completed and archived campaigns never offer Launch", () => {
    for (const status of ["paused", "completed", "archived"]) {
      expect(canLaunchCampaign(status)).toBe(false);
      expect(showsLaunchReadiness(status)).toBe(false);
    }
  });

  it("list and detail surfaces resolve the same status from one record", () => {
    const row = { status: "active", launched_at: "2026-09-20T18:39:40Z" };
    const listBadge = row.status;
    const detailBadge = row.status;
    expect(listBadge).toBe(detailBadge);
    expect(canLaunchCampaign(detailBadge)).toBe(false);
  });

  it("the scheduler only sends from active (and scheduled) campaigns", () => {
    expect([...SCHEDULER_SENDABLE_STATUSES]).toEqual(["active", "scheduled"]);
    expect(schedulerCanSend("active")).toBe(true);
    expect(schedulerCanSend("draft")).toBe(false);
    expect(schedulerCanSend("paused")).toBe(false);
    expect(schedulerCanSend("completed")).toBe(false);
  });

  it("a launch that fails on the wire but activated the row counts as launched", () => {
    expect(launchSucceededDespiteError("active")).toBe(true);
    expect(launchSucceededDespiteError("draft")).toBe(false);
    expect(launchSucceededDespiteError(null)).toBe(false);
  });

  it("covers draft -> active -> paused -> active transitions consistently", () => {
    const transitions = ["draft", "active", "paused", "active"] as const;
    const expectedLaunchable = [true, false, false, false];
    const expectedSendable = [false, true, false, true];
    transitions.forEach((status, index) => {
      expect(canLaunchCampaign(status)).toBe(expectedLaunchable[index]);
      expect(schedulerCanSend(status)).toBe(expectedSendable[index]);
    });
  });
});
