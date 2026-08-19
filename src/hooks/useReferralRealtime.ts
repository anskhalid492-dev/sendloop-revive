import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const TABLES = [
  "referral_clicks",
  "referral_attributions",
  "referral_commissions",
  "referral_payouts",
  "referral_profiles",
  "referral_fraud_flags",
  "referral_webhook_events",
] as const;

/**
 * Keeps a referral dashboard in sync with the database.
 *
 * RLS applies to Realtime, so a customer only ever receives changes to their
 * own referral rows; the admin console (staff policies) receives all of them.
 * A slow poll stays in place as a fallback when the socket cannot connect.
 */
export function useReferralRealtime(queryKey: readonly unknown[], scope: "customer" | "admin") {
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    const invalidate = () => {
      if (active) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
    };

    let channel = supabase.channel(`referrals-${scope}-${Math.random().toString(36).slice(2)}`);
    for (const table of TABLES) {
      if (scope === "customer" && table === "referral_webhook_events") continue;
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, invalidate);
    }
    channel.subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, scope, queryKey.join("|")]);
}
