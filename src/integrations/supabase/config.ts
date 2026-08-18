// Connection settings for the EXISTING Sendloop Supabase project.
// This app is intentionally connected to a pre-existing (external) Supabase
// project rather than a newly provisioned one, so the URL and the publishable
// (anon) key are pinned here. Both values are public by design and are the same
// ones the previous deployment shipped in its client bundle.
//
// Secrets (service role key, provider keys, webhook secrets) are NEVER stored
// here - they are read from environment variables inside server-only code.

export const SUPABASE_PROJECT_ID = "pmvxktppiynubpjyvbyd";

export const SUPABASE_URL =
  (typeof process !== "undefined" ? process.env?.["SUPABASE_URL"] : undefined) ??
  (import.meta.env?.["VITE_SUPABASE_URL"] as string | undefined) ??
  "https://pmvxktppiynubpjyvbyd.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  (typeof process !== "undefined" ? process.env?.["SUPABASE_PUBLISHABLE_KEY"] : undefined) ??
  (import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_vU9IGeY9KHaUy2AYwDFp5Q_6js5_im3";
