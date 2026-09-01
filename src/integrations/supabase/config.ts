// MunchReach production Supabase connection.
//
// The runtime is PINNED to the production project `rihgzkofoxcjljlbvbya`.
// Lovable Cloud injects sandbox VITE_SUPABASE_*/SUPABASE_* values into .env;
// those must never be used, otherwise the app reads an empty sandbox database.
// Environment values are honoured ONLY when they point at the production
// project (e.g. a self-hosted deploy setting the same project explicitly).

export const PRODUCTION_PROJECT_ID = "rihgzkofoxcjljlbvbya";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_ID}.supabase.co`;
const PRODUCTION_PUBLISHABLE_KEY = "sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o";

function fromProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

function fromViteEnv(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value && value.length > 0 ? value : undefined;
}

function isProduction(value: string | undefined): boolean {
  return !!value && value.includes(PRODUCTION_PROJECT_ID);
}

/** Env override, accepted only when it targets the production project. */
function productionOnly(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => isProduction(value));
}

export const SUPABASE_URL =
  productionOnly(fromViteEnv("VITE_SUPABASE_URL"), fromProcessEnv("SUPABASE_URL")) ?? PRODUCTION_URL;

export const SUPABASE_PROJECT_ID = PRODUCTION_PROJECT_ID;

export const SUPABASE_PUBLISHABLE_KEY =
  (isProduction(fromViteEnv("VITE_SUPABASE_URL"))
    ? fromViteEnv("VITE_SUPABASE_PUBLISHABLE_KEY")
    : undefined) ??
  (isProduction(fromProcessEnv("SUPABASE_URL"))
    ? fromProcessEnv("SUPABASE_PUBLISHABLE_KEY")
    : undefined) ??
  PRODUCTION_PUBLISHABLE_KEY;

export function getServiceRoleKey(): string | undefined {
  // SB_SERVICE_ROLE_KEY holds the production service role key.
  // SUPABASE_SERVICE_ROLE_KEY may be injected for the sandbox project, so it is
  // only used as a last resort.
  return fromProcessEnv("SB_SERVICE_ROLE_KEY") ?? fromProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
}
