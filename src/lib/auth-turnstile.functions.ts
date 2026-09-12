/**
 * Bot-protected email/password auth entry points.
 *
 * Sign-in and sign-up run on the server so the Turnstile token is verified
 * BEFORE any credential work happens — a caller cannot skip the check by
 * talking to the auth API directly from the browser. The resulting session is
 * handed back to the client, which installs it with supabase.auth.setSession().
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile-config";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
  turnstileToken: z.string().trim().max(2048).optional(),
});

const signUpInput = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  emailRedirectTo: z.string().trim().url().max(500),
  turnstileToken: z.string().trim().max(2048).optional(),
});

/** Publishable-key client for auth calls made on behalf of a visitor. */
async function publicAuthClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import(
    "@/integrations/supabase/config"
  );
  const key = SUPABASE_PUBLISHABLE_KEY;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const signInWithTurnstile = createServerFn({ method: "POST" })
  .inputValidator((raw) => credentials.parse(raw))
  .handler(async ({ data }) => {
    const { assertTurnstile } = await import("@/lib/turnstile.server");
    // Bot check first: no credential is touched until this passes.
    await assertTurnstile(data.turnstileToken, TURNSTILE_ACTIONS.signin);

    const client = await publicAuthClient();
    const { data: result, error } = await client.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      return { ok: false as const, error: error.message };
    }
    const session = result.session;
    if (!session) return { ok: false as const, error: "Sign-in could not be completed." };
    return {
      ok: true as const,
      session: { access_token: session.access_token, refresh_token: session.refresh_token },
    };
  });

export const signUpWithTurnstile = createServerFn({ method: "POST" })
  .inputValidator((raw) => signUpInput.parse(raw))
  .handler(async ({ data }) => {
    const { assertTurnstile } = await import("@/lib/turnstile.server");
    await assertTurnstile(data.turnstileToken, TURNSTILE_ACTIONS.signup);

    const client = await publicAuthClient();
    const { data: result, error } = await client.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: data.emailRedirectTo,
        data: { full_name: data.fullName },
      },
    });
    if (error) {
      return { ok: false as const, error: error.message };
    }
    const session = result.session;
    return {
      ok: true as const,
      session: session
        ? { access_token: session.access_token, refresh_token: session.refresh_token }
        : null,
    };
  });
