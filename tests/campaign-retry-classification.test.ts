import { describe, expect, test } from "vitest";

import { isPermanentFailure, isRetryableFailure, isSetupFailure } from "@/lib/campaign-run-state";
import { selectRetryableMessages, MAX_SETUP_SEND_ATTEMPTS } from "@/lib/dispatch.server";

const relayReject =
  'Mail relay returned 550: {"message":"550 5.1.1 no such user: bad@example.com"}';
const relayDegraded =
  'Mail relay returned 503: {"code":"SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED","message":"Service is temporarily unavailable"}';

describe("relay failure classification", () => {
  test("a relay-reported hard rejection is permanent, not a setup problem", () => {
    expect(isPermanentFailure(relayReject)).toBe(true);
    expect(isSetupFailure(relayReject)).toBe(false);
    expect(isRetryableFailure(relayReject)).toBe(false);
  });

  test("a relay outage is still a retryable setup failure", () => {
    expect(isSetupFailure(relayDegraded)).toBe(true);
    expect(isRetryableFailure(relayDegraded)).toBe(true);
  });

  test("paused mailbox stays a setup failure", () => {
    expect(isSetupFailure("This mailbox is paused. Reactivate it under Email Accounts to use it.")).toBe(true);
  });
});

describe("setup failures have a finite attempt budget", () => {
  const row = (attempts: number, lastError: string) => ({
    id: `m-${attempts}`,
    status: "failed",
    attempts,
    sent_at: null,
    last_error: lastError,
    updated_at: new Date("2026-09-17T20:00:00Z").toISOString(),
  });
  const dayStart = new Date("2026-09-17T00:00:00Z");

  test("retries a setup failure below the budget and stops at it", () => {
    const rows = [row(1, relayDegraded), row(MAX_SETUP_SEND_ATTEMPTS, relayDegraded)];
    const picked = selectRetryableMessages(rows, dayStart).map((r) => r.id);
    expect(picked).toEqual(["m-1"]);
  });

  test("never retries a relay-reported hard rejection", () => {
    expect(selectRetryableMessages([row(0, relayReject)], dayStart)).toEqual([]);
  });
});
