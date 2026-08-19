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
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Public: what the sign-in / sign-up pages are allowed to offer. */
export const getPublicAuthSettings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data } = await publicClient().rpc("public_auth_settings");
    const row = Array.isArray(data) ? data[0] : data;
    return { googleEnabled: (row as { google_enabled?: boolean } | null)?.google_enabled ?? true };
  } catch {
    return { googleEnabled: true };
  }
});

/** Admin: read the stored switch. */
export const getAuthProviderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
  .inputValidator((input) => z.object({ googleEnabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
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
    const claims = context.claims as
      | { app_metadata?: { provider?: string; providers?: string[] } }
      | undefined;
    const provider = claims?.app_metadata?.provider ?? "";
    const providers = claims?.app_metadata?.providers ?? [];
    const usedGoogle = provider === "google" || providers.includes("google");
    if (!usedGoogle) return { blocked: false };

    const { data } = await publicClient().rpc("public_auth_settings");
    const row = Array.isArray(data) ? data[0] : data;
    const enabled = (row as { google_enabled?: boolean } | null)?.google_enabled ?? true;
    if (enabled) return { blocked: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await supabaseAdmin.auth.admin.signOut(
        // revoke every session created for this user
        (context as unknown as { token?: string }).token ?? "",
      );
    } catch {
      /* best effort — the client signs out below regardless */
    }
    return { blocked: true };
  });
