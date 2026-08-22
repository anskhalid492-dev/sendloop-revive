import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const WARMUP_TABLES = [
  "warmup_jobs",
  "warmup_daily_stats",
  "warmup_health",
  "warmup_settings",
  "sending_accounts",
] as const;

/**
 * Live warmup updates: job sends, placement detection, daily rollups, mailbox
 * health recalculations and per-account health scores invalidate the dashboard
 * queries as they land — no polling.
 *
 * Returns whether the realtime channel is connected so callers can fall back to
 * a slow refetch when the socket cannot be established.
 */
export function useWarmupRealtime() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let frame: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (frame) return;
      frame = setTimeout(() => {
        frame = null;
        void queryClient.invalidateQueries({ queryKey: ["warmup-accounts"] });
        void queryClient.invalidateQueries({ queryKey: ["warmup-analytics"] });
        void queryClient.invalidateQueries({ queryKey: ["warmup-account"] });
        void queryClient.invalidateQueries({ queryKey: ["warmup-timeline"] });
        void queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      }, 400);
    };

    const channel = supabase.channel("warmup-dashboard");
    for (const table of WARMUP_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") refresh();
    });

    return () => {
      if (frame) clearTimeout(frame);
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { connected };
}
