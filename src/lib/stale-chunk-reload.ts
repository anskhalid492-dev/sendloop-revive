/**
 * Graceful stale-chunk recovery.
 *
 * When a new deployment publishes while a user still has the previous
 * version open, Vite/TanStack chunks that no longer exist on the server
 * can fail to load dynamically. This handler detects that specific failure
 * anywhere in the app (any lazy route, tab or panel), shows a short
 * "A new version is available" notice and reloads once so the user picks
 * up the new build instead of seeing a broken page.
 *
 * Safety guard: only one auto-reload per browser session for this specific
 * error type, preventing an infinite loop if the new build is also broken.
 */

const STORAGE_KEY = "munchreach.staleChunkReloaded";
const RELOAD_DELAY_MS = 1_200;
const NOTICE_ID = "munchreach-stale-chunk-notice";

export function isStaleChunkError(error: unknown): boolean {
  if (error == null) return false;

  const message =
    error instanceof Error
      ? `${error.message} ${String((error as { name?: string }).name ?? "")}`
      : typeof error === "string"
        ? error
        : typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
          ? ((error as { message: string }).message)
          : "";

  const lower = message.toLowerCase();
  return (
    lower.includes("error loading dynamically imported module") ||
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("failed to load dynamically imported module") ||
    lower.includes("importing a module script failed") ||
    // Safari / Firefox wording for a chunk that no longer exists.
    (lower.includes("dynamically imported module") && lower.includes("module")) ||
    lower.includes("unable to preload css") ||
    // A lazy route chunk from a different deploy resolves without the
    // expected export, so TanStack's lazyRouteComponent reads `.component`
    // of undefined. Same root cause: old page open against a new build.
    (lower.includes("cannot read properties of undefined") &&
      (lower.includes("'component'") || lower.includes("'default'"))) ||
    // Safari: lazyRouteComponent reads `mod[exportName ?? "default"]` of undefined.
    (lower.includes("undefined is not an object (evaluating") &&
      (lower.includes("component") || lower.includes("default"))) ||
    // A dynamic import resolved to nothing (e.g. destructuring its exports).
    (lower.includes("cannot destructure property") && lower.includes("null or undefined"))
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

/** A dependency-free notice, so it works even when app chunks are missing. */
function showNotice(): void {
  if (typeof document === "undefined" || document.getElementById(NOTICE_ID)) return;
  const notice = document.createElement("div");
  notice.id = NOTICE_ID;
  notice.setAttribute("role", "status");
  notice.textContent = "A new version is available, reloading…";
  notice.style.cssText = [
    "position:fixed",
    "left:50%",
    "top:16px",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "padding:10px 16px",
    "border-radius:9999px",
    "font:500 14px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
    "color:#fff",
    "background:#111827",
    "box-shadow:0 10px 30px -12px rgba(0,0,0,.5)",
  ].join(";");
  document.body?.appendChild(notice);
}

/**
 * Reloads once for a stale-chunk error. Returns true when the error was a
 * stale chunk (so callers can skip their own error UI).
 */
export function recoverFromStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleChunkError(error)) return false;
  scheduleReload();
  return true;
}

function scheduleReload(): void {
  if (hasReloadedThisSession()) return;
  markReloadedThisSession();
  showNotice();

  // Give any in-flight telemetry a moment to flush, then reload.
  setTimeout(() => {
    window.location.reload();
  }, RELOAD_DELAY_MS);
}

function handleErrorEvent(event: ErrorEvent): void {
  if (isStaleChunkError(event.error) || isStaleChunkError(event.message)) {
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
  // Vite fires this when a module preload for a lazy chunk 404s after a deploy.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    scheduleReload();
  });
}
