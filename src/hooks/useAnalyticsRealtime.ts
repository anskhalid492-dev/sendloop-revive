import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ANALYTICS_ROOT } from "@/lib/analytics-query";

/**
 * Analytics is derived from sends, engagement events, replies, leads and
 * campaigns. Whenever one of those tables changes for the workspace we
 * invalidate the whole `analytics` key space, so every analytics surface
 * (dashboard, Analytics, campaign analytics, campaign performance) refetches
 * the same authoritative aggregation without a browser refresh.
 */
const WORKSPACE_TABLES = [
  "campaign_messages",
  "campaign_recipients",
  "email_engagement_events",
  "campaign_replies",
  "campaigns",
  "leads",
  "sending_accounts",
] as const;

export function useAnalyticsRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      // Coalesce bursts (a send writes several rows at once) into one refetch.
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        // Every surface that renders a metric derived from these tables.
        for (const key of [
          [ANALYTICS_ROOT],
          ["campaign"],
          ["campaigns"],
          ["campaign-stats"],
          ["email-accounts"],
        ]) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }, 400);
    };

    const channel = supabase.channel(`analytics-${workspaceId}`);
    for (const table of WORKSPACE_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        invalidate,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
