import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { getFunnelDrilldown } from "@/lib/analytics.functions";

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
    it(`keeps workspace, campaign, mailbox and exact range for ${step}`, async () => {
      const calls: Array<{ table: string; filters: unknown[][] }> = [];
      const client = { from: (table: string) => {
        const call = { table, filters: [] as unknown[][] };
        calls.push(call);
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "gte", "lt", "order", "limit", "in"]) {
          builder[method] = (...args: unknown[]) => { call.filters.push([method, ...args]); return builder; };
        }
        builder["then"] = (resolve: (result: unknown) => unknown) => resolve({ data: [], error: null });
        return builder;
      } };
      const handler = getFunnelDrilldown as unknown as (input: unknown) => Promise<unknown>;
      await handler({ data: { ...scope, step }, context: { supabase: client } });
      const table = step === "sent" ? "campaign_messages" : step === "replies" ? "campaign_replies" : "email_engagement_events";
      const query = calls.find(call => call.table === table);
      expect(query?.filters).toContainEqual(["eq", "workspace_id", scope.workspaceId]);
      expect(query?.filters).toContainEqual(["eq", "campaign_id", scope.campaignId]);
      expect(query?.filters).toContainEqual(["eq", "sending_account_id", scope.accountId]);
      const dateColumn = step === "sent" ? "sent_at" : step === "replies" ? "received_at" : "occurred_at";
      expect(query?.filters).toContainEqual(["gte", dateColumn, scope.from]);
      expect(query?.filters).toContainEqual(["lt", dateColumn, scope.to]);
    });
  }
});