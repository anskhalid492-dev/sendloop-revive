/**
 * Browser-side Sentry initialisation (error monitoring only).
 *
 * Imported lazily from the root route after hydration so nothing from the
 * Sentry browser SDK ever runs during SSR. Safe to import more than once —
 * the guard below makes initialisation idempotent.
 */
import * as Sentry from "@sentry/react";

import { SENTRY_BASE_OPTIONS, browserSentryDsn } from "@/lib/sentry-config";

let initialised = false;

export function initBrowserSentry() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;

  Sentry.init({
    dsn: browserSentryDsn(),
    environment: import.meta.env.PROD ? "production" : "development",
    ...SENTRY_BASE_OPTIONS,
    // Error monitoring only: no tracing, no replay, no profiling integrations.
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          !/replay|browsertracing|profil|feedback/i.test(integration.name ?? ""),
      ),
  });
}

export function captureBrowserError(error: unknown, context?: Record<string, unknown>) {
  if (!initialised) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
