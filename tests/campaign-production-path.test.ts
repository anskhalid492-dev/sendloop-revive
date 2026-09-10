import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production campaign scheduler path", () => {
  test("cron reaches runCampaign and dispatches before the whole-queue replan", () => {
    const cron = readFileSync("src/routes/api/public/cron/run-campaigns.ts", "utf8");
    const scheduler = readFileSync("src/lib/campaign-scheduler.server.ts", "utf8");
    const dispatcher = readFileSync("src/lib/dispatch.server.ts", "utf8");

    expect(cron).toContain("runCampaignScheduler");
    expect(scheduler).toContain('await import("./dispatch.server")');
    expect(scheduler).toContain("runCampaign(supabase");

    const ensureIndex = dispatcher.indexOf("ensureInitialCampaignMessages(supabase");
    const dispatchIndex = dispatcher.indexOf("dispatchDueMessages(supabase, options)", ensureIndex);
    const replanIndex = dispatcher.indexOf("maybeReplanCampaignQueue(supabase", dispatchIndex);
    expect(ensureIndex).toBeGreaterThan(-1);
    // Sending must never sit behind the whole-queue replan: on a large campaign
    // the replan alone exceeds one invocation's budget.
    expect(dispatchIndex).toBeGreaterThan(ensureIndex);
    expect(replanIndex).toBeGreaterThan(dispatchIndex);
  });
});