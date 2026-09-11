/**
 * Server-side Sentry for the Cloudflare Workers runtime.
 *
 * The official TanStack Start guide assumes a Node server (instrument.server.mjs
 * loaded with `node --import`). This app is deployed to a Workers-style edge
 * runtime, where @sentry/node cannot run, so we use @sentry/cloudflare — the
 * runtime-appropriate SDK with the same DSN and the same error-only settings.
 */
import * as SentryCloudflare from "@sentry/cloudflare";

import { SENTRY_BASE_OPTIONS, SENTRY_DSN_DEFAULT } from "@/lib/sentry-config";

export function serverSentryDsn(): string {
  const fromEnv = process.env["SENTRY_DSN"];
  return fromEnv && fromEnv.length > 0 ? fromEnv : SENTRY_DSN_DEFAULT;
}

export function serverSentryOptions() {
  return {
    dsn: serverSentryDsn(),
    environment: process.env["NODE_ENV"] === "production" ? "production" : "development",
    ...SENTRY_BASE_OPTIONS,
  };
}

/** Reports a server-side error without ever throwing from the reporting path. */
export function captureServerError(error: unknown, context?: Record<string, unknown>) {
  try {
    SentryCloudflare.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Monitoring must never take the request down.
  }
}

export { SentryCloudflare };
