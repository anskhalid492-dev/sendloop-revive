// Supabase connection settings.
//
// Pinned to the MunchReach production project (rihgzkofoxcjljlbvbya).
// The browser build and server runtime use the project below by default.
//
// Secrets (service role key, provider keys, webhook secrets) are NEVER stored
// here — they are read from environment variables inside server-only code.

const PINNED_PROJECT_ID = "rihgzkofoxcjljlbvbya";
const PINNED_URL = "https://rihgzkofoxcjljlbvbya.supabase.co";
const PINNED_PUBLISHABLE_KEY = "sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o";

function fromProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

function fromViteEnv(name: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const value = env?.[name];
  return value && value.length > 0 ? value : undefined;
}

export const SUPABASE_URL =
  fromViteEnv("VITE_SUPABASE_URL") ??
  fromProcessEnv("SUPABASE_URL") ??
  PINNED_URL;

export const SUPABASE_PROJECT_ID =
  fromViteEnv("VITE_SUPABASE_PROJECT_ID") ??
  fromProcessEnv("SUPABASE_PROJECT_ID") ??
  PINNED_PROJECT_ID;

export const SUPABASE_PUBLISHABLE_KEY =
  fromViteEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  fromViteEnv("VITE_SUPABASE_ANON_KEY") ??
  fromProcessEnv("SUPABASE_PUBLISHABLE_KEY") ??
  fromProcessEnv("SUPABASE_ANON_KEY") ??
  PINNED_PUBLISHABLE_KEY;

// Server-only service role key. Accepts either the connected backend secret or
// the legacy custom alias, whichever is configured.
export function getServiceRoleKey(): string | undefined {
  return fromProcessEnv("SUPABASE_SERVICE_ROLE_KEY") ?? fromProcessEnv("SB_SERVICE_ROLE_KEY");
}
