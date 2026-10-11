export const EXIT_INTENT_DELAY_MS = 8_000;
export const EXIT_INTENT_SESSION_KEY = "munchreach.exit-intent.shown";

export function shouldShowExitIntent(input: {
  enabled: boolean;
  finePointer: boolean;
  elapsedMs: number;
  interacted: boolean;
  leavingTop: boolean;
  pageVisible: boolean;
  anotherDialogOpen: boolean;
}) {
  return input.enabled && input.finePointer && input.elapsedMs >= EXIT_INTENT_DELAY_MS &&
    input.interacted && input.leavingTop && input.pageVisible && !input.anotherDialogOpen;
}

// In-memory fallback preserves once-per-session across route mounts if storage is blocked.
let shownWithoutStorage = false;
export function claimExitIntentSession(storage: Pick<Storage, "getItem" | "setItem">) {
  if (shownWithoutStorage) return false;
  try {
    if (storage.getItem(EXIT_INTENT_SESSION_KEY)) return false;
    storage.setItem(EXIT_INTENT_SESSION_KEY, "1");
  } catch {
    // Private browsing / disabled storage must not cause repeated popups.
  }
  shownWithoutStorage = true;
  return true;
}