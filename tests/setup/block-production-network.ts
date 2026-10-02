/**
 * The app's server client is hard-pinned to the production project, so any
 * test that forgets to mock it would send fixture IDs ("ws-1", "lead-1") to
 * production. Block every network call to that project during tests.
 */
import { PRODUCTION_PROJECT_ID } from "@/integrations/supabase/config";

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes(PRODUCTION_PROJECT_ID)) {
    throw new Error(`Test attempted a real production database call: ${url.split("?")[0]}`);
  }
  return realFetch(input, init);
}) as typeof fetch;
