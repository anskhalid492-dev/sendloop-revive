import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Live warmup updates: job sends, placement detection, daily rollups and
 * health recalculations invalidate the dashboard queries as they land.
 */
export function useWarmupRealtime() {
  const queryClient = useQueryClient();

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
      }, 400);
    };

    const channel = supabase.channel("warmup-dashboard");
    for (const table of ["warmup_jobs", "warmup_daily_stats", "warmup_health", "warmup_settings", "warmup_events"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();

    return () => {
      if (frame) clearTimeout(frame);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
