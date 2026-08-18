// Connection settings for the EXISTING (external) Sendloop Supabase project.
//
// This app is intentionally pinned to the pre-existing production project
// `pmvxktppiynubpjyvbyd` rather than any newly provisioned backend, so the URL
// and the publishable (anon) key are hardcoded here. Both values are public by
// design and shipped in the previous deployment's client bundle.
//
// Secrets (service role key, provider keys, webhook secrets) are NEVER stored
// here - they are read from environment variables inside server-only code.

export const SUPABASE_PROJECT_ID = "pmvxktppiynubpjyvbyd";

export const SUPABASE_URL = "https://pmvxktppiynubpjyvbyd.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vU9IGeY9KHaUy2AYwDFp5Q_6js5_im3";

// Service-role key for the SAME external project. Stored as SB_SERVICE_ROLE_KEY
// so it is never confused with a platform-managed key for another project.
export function getServiceRoleKey(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env?.["SB_SERVICE_ROLE_KEY"];
}
