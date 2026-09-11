/**
 * Single source of truth for the Sentry configuration.
 *
 * The DSN is a public, write-only ingest identifier (it ships inside every
 * browser bundle by design), so it lives here as a default and can still be
 * overridden per environment:
 *   - browser: VITE_SENTRY_DSN
 *   - server:  SENTRY_DSN
 *
 * Error monitoring only: tracing, profiling, session replay, logs and metrics
 * are all deliberately disabled.
 */
export const SENTRY_DSN_DEFAULT =
  "https://916d1197779db99e1bd915d6ea11dad7@o4512070311804928.ingest.us.sentry.io/4512070321831936";

export const SENTRY_ORG = "munchreach-llc";
export const SENTRY_PROJECT = "javascript-tanstackstart-react";

/** Options shared by the browser and the server SDK. */
export const SENTRY_BASE_OPTIONS = {
  // Error monitoring only.
  tracesSampleRate: 0,
  enableLogs: false,
  sendDefaultPii: false,
} as const;

export function browserSentryDsn(): string {
  const fromEnv = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : SENTRY_DSN_DEFAULT;
}
