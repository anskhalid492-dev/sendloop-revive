import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Analytics is derived from sends, engagement events and replies. Whenever one
 * of those tables changes for the workspace we refetch the aggregates, so the
 * dashboard stays live without polling.
 */
export function useAnalyticsRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    const channel = supabase.channel(`analytics-${workspaceId}`);
    for (const table of ["email_engagement_events", "campaign_messages", "campaign_replies"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        invalidate,
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
