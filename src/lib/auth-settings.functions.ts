/**
 * Platform authentication settings.
 *
 * Only the `google` sign-in switch lives here today. It is stored in the
 * existing `platform_settings` table under the `auth_providers` key, read
 * publicly through the `public_auth_settings()` security-definer RPC (so the
 * sign-in page can hide the button before anyone is authenticated) and
 * enforced server-side for anyone who tries the OAuth flow anyway.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public: what the sign-in / sign-up pages are allowed to offer. */
export const getPublicAuthSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { readGoogleEnabled } = await import("@/lib/auth-settings.server");
  try {
    return { googleEnabled: await readGoogleEnabled() };
  } catch {
    return { googleEnabled: true };
  }
});

/** Admin: read the stored switch. */
export const getAuthProviderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/auth-settings.server");
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "auth_providers")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = (data?.value ?? {}) as { google?: boolean };
    return { googleEnabled: value.google ?? true };
  });

export const saveAuthProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ googleEnabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/auth-settings.server");
    await assertAdmin(context);
    const { error } = await context.supabase.from("platform_settings").upsert(
      { key: "auth_providers", value: { google: data.googleEnabled } } as never,
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { googleEnabled: data.googleEnabled };
  });

/**
 * Server-side enforcement: when Google sign-in is switched off, any session
 * that was created through Google is revoked immediately, so hiding the
 * button is not the only barrier.
 */
export const enforceOAuthPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { readGoogleEnabled } = await import("@/lib/auth-settings.server");
    const claims = context.claims as
      | { app_metadata?: { provider?: string; providers?: string[] } }
      | undefined;
    const provider = claims?.app_metadata?.provider ?? "";
    const providers = claims?.app_metadata?.providers ?? [];
    const usedGoogle = provider === "google" || providers.includes("google");
    if (!usedGoogle) return { blocked: false };

    if (await readGoogleEnabled()) return { blocked: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const jwt = (getRequestHeader("authorization") ?? "").replace(/^Bearer\s+/i, "");
    try {
      // Revoke every session for this user, not just the current request.
      if (jwt) await supabaseAdmin.auth.admin.signOut(jwt, "global");
    } catch {
      /* best effort — the client signs out below regardless */
    }
    return { blocked: true };
  });
