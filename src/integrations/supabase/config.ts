// Supabase connection settings.
//
// Pinned to the MunchReach production project: rihgzkofoxcjljlbvbya.
// These values are intentionally hard-coded so the application cannot
// accidentally fall back to any other Supabase project regardless of the
// runtime environment variables.
//
// Secrets (service role key, provider keys, webhook secrets) are NEVER stored
// here — they are read from environment variables inside server-only code.

function fromProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

export const SUPABASE_URL = "https://rihgzkofoxcjljlbvbya.supabase.co";

export const SUPABASE_PROJECT_ID = "rihgzkofoxcjljlbvbya";

export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o";

// Server-only service role key for the pinned project (rihgzkofoxcjljlbvbya).
// SB_SERVICE_ROLE_KEY is the project-owned secret and takes precedence; the
// platform-injected SUPABASE_SERVICE_ROLE_KEY belongs to a different project
// and is only used as a last-resort fallback.
export function getServiceRoleKey(): string | undefined {
  return fromProcessEnv("SB_SERVICE_ROLE_KEY") ?? fromProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
}
