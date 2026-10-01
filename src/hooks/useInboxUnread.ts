import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useActiveWorkspaceId } from "@/hooks/useWorkspace";

/**
 * Live count of unread received conversations — the same rule as the inbox
 * "Unread" folder (has an inbound message, not archived, unread).
 */
export function useInboxUnread(): number {
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const key = ["inbox-unread-badge", workspaceId];

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId!)
        .eq("has_inbound", true)
        .eq("archived", false)
        .eq("unread", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ["inbox-unread-badge", workspaceId] });
      }, 300);
    };
    const channel = supabase
      .channel(`inbox-unread-badge:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);

  return query.data ?? 0;
}
