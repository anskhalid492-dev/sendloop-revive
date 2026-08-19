import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Live automation updates.
 *
 * The worker writes run status changes on the server, so the only way the UI
 * can stay truthful without a manual reload is to listen to the database.
 * Every automation surface calls this hook; the channel name is unique per
 * instance because Supabase returns the already-subscribed channel when a name
 * is reused, which throws "cannot add postgres_changes callbacks after
 * subscribe()".
 */
export function useAutomationRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;

    const invalidate = () => {
      if (!active) return;
      void queryClient.invalidateQueries({ queryKey: ["automations"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-run"] });
    };

    const filter = `workspace_id=eq.${workspaceId}`;
    const channel = supabase
      .channel(`automations-${workspaceId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_runs", filter }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_run_steps", filter }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "automations", filter }, invalidate)
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
