import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production campaign scheduler path", () => {
  test("cron reaches runCampaign and replans immediately before dispatch selection", () => {
    const cron = readFileSync("src/routes/api/public/cron/run-campaigns.ts", "utf8");
    const scheduler = readFileSync("src/lib/campaign-scheduler.server.ts", "utf8");
    const dispatcher = readFileSync("src/lib/dispatch.server.ts", "utf8");

    expect(cron).toContain("runCampaignScheduler");
    expect(scheduler).toContain('await import("./dispatch.server")');
    expect(scheduler).toContain("runCampaign(supabase");

    const ensureIndex = dispatcher.indexOf("ensureInitialCampaignMessages(supabase");
    const replanIndex = dispatcher.indexOf("rescheduleCampaignQueue(supabase");
    const dispatchIndex = dispatcher.indexOf("dispatchDueMessages(supabase, options)", replanIndex);
    expect(ensureIndex).toBeGreaterThan(-1);
    expect(replanIndex).toBeGreaterThan(ensureIndex);
    expect(dispatchIndex).toBeGreaterThan(replanIndex);
  });
});