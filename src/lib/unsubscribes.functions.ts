/**
 * Admin reporting for campaign unsubscribes.
 *
 * Counts come from `campaign_unsubscribes`, which stores one row per campaign +
 * address together with the source it arrived from, so the breakdown reflects
 * how readers actually opted out rather than a single aggregate number.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export type UnsubscribeCampaignRow = {
  campaignId: string | null;
  campaignName: string;
  workspaceId: string | null;
  workspaceName: string;
  oneClick: number;
  listUnsubscribe: number;
  emailLink: number;
  total: number;
  lastUnsubscribedAt: string | null;
};

export type UnsubscribeEventRow = {
  id: string;
  email: string;
  source: string;
  campaignId: string | null;
  campaignName: string;
  createdAt: string;
};

export const getUnsubscribeReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const [{ data: rows, error }, { data: recent }] = await Promise.all([
      supabaseAdmin
        .from("campaign_unsubscribes")
        .select("campaign_id, workspace_id, source, created_at")
        .gte("created_at", since)
        .limit(10_000),
      supabaseAdmin
        .from("campaign_unsubscribes")
        .select("id, email, source, campaign_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const campaignIds = [
      ...new Set(all.map((r) => r.campaign_id).filter((v): v is string => Boolean(v))),
    ];
    const workspaceIds = [
      ...new Set(all.map((r) => r.workspace_id).filter((v): v is string => Boolean(v))),
    ];

    const [{ data: campaigns }, { data: workspaces }] = await Promise.all([
      campaignIds.length
        ? supabaseAdmin.from("campaigns").select("id, name").in("id", campaignIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      workspaceIds.length
        ? supabaseAdmin.from("workspaces").select("id, name").in("id", workspaceIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const campaignNames = new Map((campaigns ?? []).map((c) => [c.id, c.name] as const));
    const workspaceNames = new Map((workspaces ?? []).map((w) => [w.id, w.name] as const));

    const byCampaign = new Map<string, UnsubscribeCampaignRow>();
    for (const row of all) {
      const key = row.campaign_id ?? "unknown";
      const existing =
        byCampaign.get(key) ??
        ({
          campaignId: row.campaign_id ?? null,
          campaignName: campaignNames.get(row.campaign_id ?? "") ?? "Deleted campaign",
          workspaceId: row.workspace_id ?? null,
          workspaceName: workspaceNames.get(row.workspace_id ?? "") ?? "—",
          oneClick: 0,
          listUnsubscribe: 0,
          emailLink: 0,
          total: 0,
          lastUnsubscribedAt: null,
        } satisfies UnsubscribeCampaignRow);

      if (row.source === "one_click") existing.oneClick += 1;
      else if (row.source === "list_unsubscribe") existing.listUnsubscribe += 1;
      else existing.emailLink += 1;
      existing.total += 1;
      if (!existing.lastUnsubscribedAt || row.created_at > existing.lastUnsubscribedAt) {
        existing.lastUnsubscribedAt = row.created_at;
      }
      byCampaign.set(key, existing);
    }

    const campaignRows = [...byCampaign.values()].sort((a, b) => b.total - a.total);

    const events: UnsubscribeEventRow[] = (recent ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      source: row.source,
      campaignId: row.campaign_id ?? null,
      campaignName: campaignNames.get(row.campaign_id ?? "") ?? "Deleted campaign",
      createdAt: row.created_at,
    }));

    return {
      days: data.days,
      totals: {
        total: campaignRows.reduce((sum, r) => sum + r.total, 0),
        oneClick: campaignRows.reduce((sum, r) => sum + r.oneClick, 0),
        listUnsubscribe: campaignRows.reduce((sum, r) => sum + r.listUnsubscribe, 0),
        emailLink: campaignRows.reduce((sum, r) => sum + r.emailLink, 0),
      },
      campaigns: campaignRows,
      events,
    };
  });
