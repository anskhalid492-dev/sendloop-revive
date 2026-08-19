import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { enforceOAuthPolicy } from "@/lib/auth-settings.functions";

/**
 * If an admin turned Google sign-in off, any session created through Google is
 * revoked server-side; this hook reacts to that verdict in the UI.
 */
export function useOAuthPolicy() {
  const check = useServerFn(enforceOAuthPolicy);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await check({});
        if (cancelled || !result.blocked) return;
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        toast.error("Google sign-in has been disabled. Please sign in with email and password.");
        navigate({ to: "/signin", replace: true });
      } catch {
        /* policy check is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [check, navigate, queryClient]);
}
