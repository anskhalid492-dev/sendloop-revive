import { describe, expect, it } from "vitest";
import { scopeAnalyticsQuery } from "@/lib/analytics-filters";

const scope = {
  workspaceId: "throwaway-analytics-filter-workspace",
  campaignId: "throwaway-analytics-filter-campaign",
  accountId: "throwaway-analytics-filter-mailbox",
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-04T00:00:00.000Z",
  limit: 200,
};

describe("analytics drilldown shared filters (mocked throwaway workspace)", () => {
  for (const step of ["sent", "delivered", "opens", "replies"] as const) {
    it(`keeps workspace, campaign, mailbox and exact range for ${step}`, () => {
      const filters: unknown[][] = [];
      const query = {
        eq: (column: string, value: string) => { filters.push(["eq", column, value]); return query; },
        gte: (column: string, value: string) => { filters.push(["gte", column, value]); return query; },
        lt: (column: string, value: string) => { filters.push(["lt", column, value]); return query; },
      };
      const dateColumn = step === "sent" ? "sent_at" : step === "replies" ? "received_at" : "occurred_at";
      scopeAnalyticsQuery(query, scope, dateColumn);
      expect(filters).toEqual([
        ["eq", "workspace_id", scope.workspaceId],
        ["gte", dateColumn, scope.from],
        ["lt", dateColumn, scope.to],
        ["eq", "campaign_id", scope.campaignId],
        ["eq", "sending_account_id", scope.accountId],
      ]);
    });
  }
});