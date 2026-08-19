import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { listNotifications } from "@/lib/notifications.functions";

/**
 * Shared notification feed.
 *
 * Backed by one react-query cache entry so the bell and the sidebar badge stay
 * in sync, and refreshed instantly from Realtime (with a slow poll as a
 * fallback when the socket cannot connect).
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listNotifications);

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAll(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          if (!active) return;
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["support"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages" },
        () => {
          if (!active) return;
          void queryClient.invalidateQueries({ queryKey: ["support"] });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;
  const supportUnread = items.filter(
    (n) => !n.read && (n.type === "support_reply" || n.type === "support_status"),
  ).length;

  return { query, items, unread, supportUnread };
}
