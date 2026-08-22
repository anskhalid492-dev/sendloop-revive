// Supabase connection settings.
//
// NOTHING is hard-coded here: the URL, project id and publishable (anon) key are
// read from environment variables, so the app always follows whichever Supabase
// project is currently connected to this Lovable project.
//
// Browser build: import.meta.env.VITE_SUPABASE_*
// Server runtime: process.env.SUPABASE_*
//
// Secrets (service role key, provider keys, webhook secrets) are NEVER stored
// here - they are read from environment variables inside server-only code.

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

// PHASE 6 CUTOVER (pinned): MunchReach production backend.
// The publishable key is safe to keep in code; the service-role key is not and
// is read from the SB_SERVICE_ROLE_KEY secret below.
// Rollback: delete these three PINNED_* constants and the app falls straight
// back to the previous project through the managed env vars.
const PINNED_PROJECT_ID = "rihgzkofoxcjljlbvbya";
const PINNED_URL = "https://rihgzkofoxcjljlbvbya.supabase.co";
const PINNED_PUBLISHABLE_KEY = "sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o";

export const SUPABASE_URL =
  PINNED_URL ?? fromViteEnv("VITE_SUPABASE_URL") ?? fromProcessEnv("SUPABASE_URL") ?? "";

export const SUPABASE_PROJECT_ID =
  PINNED_PROJECT_ID ??
  fromViteEnv("VITE_SUPABASE_PROJECT_ID") ??
  fromProcessEnv("SUPABASE_PROJECT_ID") ??
  "";

export const SUPABASE_PUBLISHABLE_KEY =
  PINNED_PUBLISHABLE_KEY ??
  fromViteEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  fromViteEnv("VITE_SUPABASE_ANON_KEY") ??
  fromProcessEnv("SUPABASE_PUBLISHABLE_KEY") ??
  fromProcessEnv("SUPABASE_ANON_KEY") ??
  "";

// Server-only service role key. Accepts either the platform-managed name or the
// custom SB_SERVICE_ROLE_KEY secret, whichever is configured.
export function getServiceRoleKey(): string | undefined {
  return fromProcessEnv("SUPABASE_SERVICE_ROLE_KEY") ?? fromProcessEnv("SB_SERVICE_ROLE_KEY");
}
