import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the CRM board live: stage moves, new replies, tasks and campaign
 * activity all land as database rows, so we simply refetch the CRM queries
 * whenever one of those tables changes for this workspace.
 */
export function useCrmRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-contact"] });
    };

    const channel = supabase.channel(`crm-${workspaceId}`);
    for (const table of [
      "leads",
      "lead_tasks",
      "lead_notes",
      "lead_activities",
      "conversations",
      "campaign_recipients",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        invalidate,
      );
    }
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "crm_stages",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => void queryClient.invalidateQueries({ queryKey: ["crm-stages"] }),
    );
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
