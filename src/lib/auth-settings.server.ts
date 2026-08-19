/**
 * Server-only helpers backing the platform authentication settings.
 * Kept out of `auth-settings.functions.ts` so that module stays a thin
 * wrapper around its server-function declarations.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export function publicClient() {
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

/** Reads the public switch through the security-definer RPC. */
export async function readGoogleEnabled(): Promise<boolean> {
  const { data } = await publicClient().rpc("public_auth_settings");
  const row = Array.isArray(data) ? data[0] : data;
  return (row as { google_enabled?: boolean } | null)?.google_enabled ?? true;
}
