/**
 * Tracking tokens fail closed without a private signing key. Give the test
 * process a throwaway, test-only key so token round-trips can run; it is never
 * a real secret and tests that need "no key" stub it to "" explicitly.
 */
if (!process.env["OPEN_TRACKING_SECRET"]) {
  process.env["OPEN_TRACKING_SECRET"] = "test-only-open-tracking-signing-key-not-a-real-secret";
}
