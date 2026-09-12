/**
 * Cloudflare Turnstile public configuration (client-safe).
 *
 * The site key is a public value, but it is still read from the environment
 * (`VITE_TURNSTILE_SITE_KEY`) so a different widget can be pointed at a
 * staging deploy without touching code. The committed default keeps the
 * widget working on builds where the variable is not injected.
 *
 * The matching secret key lives only in the backend secret store as
 * TURNSTILE_SECRET_KEY and is never referenced from client code.
 */
const DEFAULT_SITE_KEY = "0x4AAAAAAEw0319Ij_wKLBGY";

function fromViteEnv(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const TURNSTILE_SITE_KEY = fromViteEnv("VITE_TURNSTILE_SITE_KEY") ?? DEFAULT_SITE_KEY;

/** Turnstile actions, kept in sync with the server-side verification calls. */
export const TURNSTILE_ACTIONS = {
  signin: "signin",
  signup: "signup",
  passwordReset: "password-reset",
} as const;

export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
