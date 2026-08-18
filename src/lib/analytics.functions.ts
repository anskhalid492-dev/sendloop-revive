/**
 * Analytics server functions.
 *
 * Every number is aggregated in Postgres from real send, engagement and reply
 * rows. The aggregation functions are security definer and check workspace
 * membership themselves, so a caller can never read another workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AnalyticsAccountRow,
  AnalyticsCampaignRow,
  AnalyticsSummary,
  AnalyticsTimeseriesPoint,
} from "@/lib/analytics-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const rangeInput = z.object({
  workspaceId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
});

const ZERO: AnalyticsSummary = {
  sent: 0,
  delivered: 0,
  opens: 0,
  clicks: 0,
  replies: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  failed: 0,
};

function toSummary(row: Record<string, unknown> | undefined): AnalyticsSummary {
  if (!row) return ZERO;
  return {
    sent: Number(row["sent"] ?? 0),
    delivered: Number(row["delivered"] ?? 0),
    opens: Number(row["opens"] ?? 0),
    clicks: Number(row["clicks"] ?? 0),
    replies: Number(row["replies"] ?? 0),
    bounced: Number(row["bounced"] ?? 0),
    unsubscribed: Number(row["unsubscribed"] ?? 0),
    complained: Number(row["complained"] ?? 0),
    failed: Number(row["failed"] ?? 0),
  };
}

/** Totals for the selected range plus the immediately preceding range. */
export const getAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const from = new Date(data.from);
    const to = new Date(data.to);
    const span = Math.max(to.getTime() - from.getTime(), 60_000);
    const prevFrom = new Date(from.getTime() - span);

    const [current, previous] = await Promise.all([
      client.rpc("analytics_summary", {
        _workspace_id: data.workspaceId,
        _from: from.toISOString(),
        _to: to.toISOString(),
      }),
      client.rpc("analytics_summary", {
        _workspace_id: data.workspaceId,
        _from: prevFrom.toISOString(),
        _to: from.toISOString(),
      }),
    ]);

    if (current.error) throw new Error(current.error.message);
    if (previous.error) throw new Error(previous.error.message);

    return {
      current: toSummary(current.data?.[0]),
      previous: toSummary(previous.data?.[0]),
    };
  });

/** Bucketed series for the performance chart. */
export const getAnalyticsTimeseries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    rangeInput.extend({ bucket: z.enum(["hour", "day"]).default("day") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("analytics_timeseries", {
      _workspace_id: data.workspaceId,
      _from: new Date(data.from).toISOString(),
      _to: new Date(data.to).toISOString(),
      _bucket: data.bucket,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      bucket: String(r["bucket"]),
      sent: Number(r["sent"] ?? 0),
      delivered: Number(r["delivered"] ?? 0),
      opens: Number(r["opens"] ?? 0),
      clicks: Number(r["clicks"] ?? 0),
      replies: Number(r["replies"] ?? 0),
      bounced: Number(r["bounced"] ?? 0),
      unsubscribed: Number(r["unsubscribed"] ?? 0),
    })) as AnalyticsTimeseriesPoint[];
  });

/** Per-campaign performance for the range. */
export const getAnalyticsByCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("analytics_by_campaign", {
      _workspace_id: data.workspaceId,
      _from: new Date(data.from).toISOString(),
      _to: new Date(data.to).toISOString(),
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      campaignId: String(r["campaign_id"]),
      name: String(r["campaign_name"] ?? "Untitled campaign"),
      status: String(r["status"] ?? "draft"),
      sent: Number(r["sent"] ?? 0),
      delivered: Number(r["delivered"] ?? 0),
      opens: Number(r["opens"] ?? 0),
      clicks: Number(r["clicks"] ?? 0),
      replies: Number(r["replies"] ?? 0),
      bounced: Number(r["bounced"] ?? 0),
      unsubscribed: Number(r["unsubscribed"] ?? 0),
    })) as AnalyticsCampaignRow[];
  });

/** Per-mailbox performance for the range. */
export const getAnalyticsByAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("analytics_by_account", {
      _workspace_id: data.workspaceId,
      _from: new Date(data.from).toISOString(),
      _to: new Date(data.to).toISOString(),
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      accountId: String(r["account_id"]),
      fromEmail: String(r["from_email"] ?? ""),
      sent: Number(r["sent"] ?? 0),
      delivered: Number(r["delivered"] ?? 0),
      opens: Number(r["opens"] ?? 0),
      clicks: Number(r["clicks"] ?? 0),
      replies: Number(r["replies"] ?? 0),
      bounced: Number(r["bounced"] ?? 0),
      unsubscribed: Number(r["unsubscribed"] ?? 0),
    })) as AnalyticsAccountRow[];
  });
