/**
 * Graceful stale-chunk recovery.
 *
 * When a new deployment publishes while a user still has the previous
 * version open, Vite/TanStack chunks that no longer exist on the server
 * can fail to load dynamically. This handler detects that specific failure
 * and reloads the page once so the user picks up the new build instead of
 * seeing a broken page.
 *
 * Safety guard: only one auto-reload per browser session for this specific
 * error type, preventing an infinite loop if the new build is also broken.
 */

const STORAGE_KEY = "munchreach.staleChunkReloaded";
const RELOAD_DELAY_MS = 1_500;

function isStaleChunkError(error: unknown): boolean {
  if (error == null) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const lower = message.toLowerCase();
  return (
    lower.includes("error loading dynamically imported module") ||
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("failed to load dynamically imported module")
  );
}

function hasReloadedThisSession(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // sessionStorage can throw in private/sandboxed contexts.
    return false;
  }
}

function markReloadedThisSession(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ignore.
  }
}

function scheduleReload(): void {
  if (hasReloadedThisSession()) return;
  markReloadedThisSession();

  // Give any in-flight telemetry a moment to flush, then reload.
  setTimeout(() => {
    window.location.reload();
  }, RELOAD_DELAY_MS);
}

function handleErrorEvent(event: ErrorEvent): void {
  if (isStaleChunkError(event.error)) {
    event.preventDefault();
    scheduleReload();
  }
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  if (isStaleChunkError(event.reason)) {
    event.preventDefault();
    scheduleReload();
  }
}

export function initStaleChunkReload(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", handleErrorEvent);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
}
