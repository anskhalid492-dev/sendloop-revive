/**
 * Public server functions for direct Google Sign-In (Google Identity
 * Services). The Client ID comes from Admin → Settings → Authentication →
 * Google Sign-In; the Client Secret never leaves the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function activeClient() {
  const { readGoogleEnabled } = await import("@/lib/auth-settings.server");
  const { getGoogleSignInClient } = await import("@/lib/auth-providers-config.server");
  let switchOn = true;
  try {
    switchOn = await readGoogleEnabled();
  } catch {
    switchOn = true;
  }
  if (!switchOn) return null;
  return getGoogleSignInClient();
}

/** Public: only the (non-secret) Client ID, and only when sign-in is enabled. */
export const getGoogleSignInConfig = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getGoogleSignInClientId } = await import("@/lib/auth-providers-config.server");
    const { readGoogleEnabled } = await import("@/lib/auth-settings.server");
    const on = await readGoogleEnabled().catch(() => true);
    const clientId = on ? await getGoogleSignInClientId() : null;
    return { available: Boolean(clientId), clientId };
  } catch {
    return { available: false, clientId: null };
  }
});

/** Public: exchanges the GIS code, verifies the Google ID token and returns a normal session. */
export const completeGoogleSignIn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ code: z.string().trim().min(10).max(2048) }).parse(raw))
  .handler(async ({ data }) => {
    const m = await import("@/lib/google-signin.server");
    return m.completeGoogleSignInWith(
      {
        getClient: activeClient,
        exchangeCode: (code, client) => m.exchangeGoogleCode(code, client.clientId, client.clientSecret),
        verify: (token, clientId) => m.verifyGoogleIdToken(token, clientId),
        auth: await m.supabaseAuthOps(),
      },
      data.code,
    );
  });
