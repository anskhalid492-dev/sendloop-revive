import { useCallback, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { completeGoogleSignIn, getGoogleSignInConfig } from "@/lib/google-signin.functions";
import { requestGoogleAuthCode } from "@/lib/google-identity-browser";

export const GOOGLE_UNAVAILABLE_MESSAGE =
  "Google Sign-In is currently unavailable. Please try another sign-in method.";

/**
 * Direct Google Sign-In via Google Identity Services. The resulting session is
 * a normal Supabase Auth session installed with setSession().
 */
export function useGoogleSignIn(onSignedIn: (result: { isNewUser: boolean }) => void) {
  const [pending, setPending] = useState(false);

  const start = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      const config = await getGoogleSignInConfig().catch(() => null);
      if (!config?.available || !config.clientId) {
        toast.error(GOOGLE_UNAVAILABLE_MESSAGE);
        return;
      }
      let code: Awaited<ReturnType<typeof requestGoogleAuthCode>>;
      try {
        code = await requestGoogleAuthCode(config.clientId);
      } catch {
        toast.error(GOOGLE_UNAVAILABLE_MESSAGE);
        return;
      }
      if (code.kind === "cancelled") return; // user closed the popup — no error
      if (code.kind === "error") {
        toast.error("Google sign-in was not completed. Please try again.");
        return;
      }
      const result = await completeGoogleSignIn({ data: { code: code.code } }).catch(() => null);
      if (!result) {
        toast.error("Google sign-in could not be verified. Please try again.");
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { error } = await supabase.auth.setSession(result.session);
      if (error) {
        toast.error("Google sign-in could not be completed. Please try again.");
        return;
      }
      onSignedIn({ isNewUser: result.isNewUser });
    } finally {
      setPending(false);
    }
  }, [pending, onSignedIn]);

  return { start, pending };
}
