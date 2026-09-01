// Supabase connection settings supplied by the Lovable Cloud connection.
// Secrets are read only from runtime environment variables.

function fromProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

function fromViteEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PROJECT_ID" | "VITE_SUPABASE_PUBLISHABLE_KEY"): string | undefined {
  const value = import.meta.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const SUPABASE_URL =
  fromViteEnv("VITE_SUPABASE_URL") ?? fromProcessEnv("SUPABASE_URL") ?? "";

export const SUPABASE_PROJECT_ID =
  fromViteEnv("VITE_SUPABASE_PROJECT_ID") ?? fromProcessEnv("SUPABASE_PROJECT_ID") ?? "";

export const SUPABASE_PUBLISHABLE_KEY =
  fromViteEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  fromProcessEnv("SUPABASE_PUBLISHABLE_KEY") ??
  "";

export function getServiceRoleKey(): string | undefined {
  return fromProcessEnv("SUPABASE_SERVICE_ROLE_KEY") ?? fromProcessEnv("SB_SERVICE_ROLE_KEY");
}
