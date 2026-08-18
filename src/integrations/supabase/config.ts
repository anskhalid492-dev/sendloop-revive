// Public connection settings for the backend, read from the generated env vars.
// Secrets (service role key, provider keys, webhook secrets) are NEVER stored
// here - they are read from environment variables inside server-only code.

export const SUPABASE_PROJECT_ID =
  (typeof process !== "undefined" ? process.env?.["SUPABASE_PROJECT_ID"] : undefined) ??
  (import.meta.env?.["VITE_SUPABASE_PROJECT_ID"] as string | undefined) ??
  "";

export const SUPABASE_URL =
  (typeof process !== "undefined" ? process.env?.["SUPABASE_URL"] : undefined) ??
  (import.meta.env?.["VITE_SUPABASE_URL"] as string | undefined) ??
  "";

export const SUPABASE_PUBLISHABLE_KEY =
  (typeof process !== "undefined" ? process.env?.["SUPABASE_PUBLISHABLE_KEY"] : undefined) ??
  (import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  "";
