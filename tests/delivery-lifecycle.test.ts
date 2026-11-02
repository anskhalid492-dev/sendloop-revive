import { describe, expect, it } from "vitest";
import {
  bouncePenalty,
  decideProviderCall,
  describeSendFailure,
  originalMessageIdFromBounce,
  PROVIDER_CALL_CUTOFF_MS,
  PLATFORM_LIMIT_MS,
  POST_SEND_RESERVE_MS,
  providerCutoffFromDeadline,
  RELAY_SEND_TIMEOUT_MS,
  routeWarmupMessage,
  softSignalPenalty,
  warmupKindForReport,
  warmupReportExternalId,
} from "@/lib/delivery-lifecycle";
import { parseDeliveryReport } from "@/lib/dsn-parse";
import { decideInterrupted, phaseMarker } from "@/lib/campaign-send-phase";

const DSN_WITH_ORIGINAL = [
  "Delivery to the following recipient failed permanently:",
  "",
  "Final-Recipient: rfc822; peer@warm.example",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does not exist",
  "",
  "--boundary",
  "Content-Type: text/rfc822-headers",
  "",
  "From: sender@agency.com",
  "To: peer@warm.example",
  "Message-ID: <orig-123@agency.com>",
  "X-MunchReach-Warmup-Id: MRW-0123456789abcdef",
].join("\r\n");

describe("provider-call timing (timeout root cause)", () => {
  it("a send started at the cutoff can still time out cleanly before the platform kill", () => {
    expect(PROVIDER_CALL_CUTOFF_MS + RELAY_SEND_TIMEOUT_MS + POST_SEND_RESERVE_MS).toBeLessThanOrEqual(PLATFORM_LIMIT_MS);
  });

  it("derives the cutoff from a start+20s deadline as start+15s", () => {
    const start = 1_000_000;
    expect(providerCutoffFromDeadline(start + 20_000, 20_000)).toBe(start + 15_000);
  });

  it("hands rows back untouched after the cutoff (connection never opened)", () => {
    expect(decideProviderCall({ nowMs: 16_000, cutoffAtMs: 15_000, mailboxId: "a", slowMailboxes: new Set() })).toBe("defer_run_cutoff");
    expect(decideProviderCall({ nowMs: 14_000, cutoffAtMs: 15_000, mailboxId: "a", slowMailboxes: new Set() })).toBe("send");
  });

  it("one slow mailbox is skipped for the rest of the run without blocking others", () => {
    const slow = new Set(["slow"]);
    expect(decideProviderCall({ nowMs: 1, cutoffAtMs: 15_000, mailboxId: "slow", slowMailboxes: slow })).toBe("defer_slow_mailbox");
    expect(decideProviderCall({ nowMs: 1, cutoffAtMs: 15_000, mailboxId: "fast", slowMailboxes: slow })).toBe("send");
  });

  it("queue recovery: claimed rows requeue, provider_call rows are held (no duplicate send)", () => {
    expect(decideInterrupted(phaseMarker("claimed", new Date()))).toBe("requeue");
    expect(decideInterrupted(phaseMarker("provider_call", new Date()))).toBe("hold_unknown");
  });
});

describe("readable send failures", () => {
  it("timeout after possible acceptance is unknown, never a bounce", () => {
    const d = describeSendFailure("The operation was aborted due to timeout");
    expect(d?.category).toBe("outcome_unknown");
    expect(describeSendFailure("send_outcome_unknown_after_interrupt: held for review, not resent")?.category).toBe("outcome_unknown");
  });

  it("connection failure before acceptance says nothing was sent", () => {
    expect(describeSendFailure("connect ECONNREFUSED 1.2.3.4:587")?.category).toBe("connection");
  });

  it("hard bounce keeps its SMTP code", () => {
    const d = describeSendFailure("550 5.1.1 <x@y.com>: Recipient address rejected: User unknown");
    expect(d?.category).toBe("bounced");
    expect(d?.code).toContain("550");
  });

  it("temporary deferral is deferred", () => {
    expect(describeSendFailure("421 4.7.0 Try again later, closing connection")?.category).toBe("deferred");
  });

  it("sender-side refusal is not a bounce", () => {
    expect(describeSendFailure("554 5.7.1 Outbound sending is disabled for this account")?.category).toBe("sender_blocked");
  });
});

describe("bounce reports", () => {
  it("extracts the original Message-ID, not the report's own", () => {
    expect(originalMessageIdFromBounce(DSN_WITH_ORIGINAL, "<dsn-1@mx.google.com>")).toBe("<orig-123@agency.com>");
    expect(originalMessageIdFromBounce("Message-ID: <dsn-1@mx>", "<dsn-1@mx>")).toBeNull();
  });

  it("classifies hard bounce, soft bounce and rejection", () => {
    expect(warmupKindForReport(parseDeliveryReport({ text: DSN_WITH_ORIGINAL }).kind)).toBe("bounced");
    expect(warmupKindForReport(parseDeliveryReport({ text: "Status: 4.2.2\r\nDiagnostic-Code: smtp; 452 4.2.2 Mailbox full" }).kind)).toBe("deferred");
    expect(warmupKindForReport("failed")).toBe("rejected");
  });

  it("a warmup bounce report read in the SENDING mailbox is that job's bounce", () => {
    expect(routeWarmupMessage({ isBounceReport: true, reader: "sender@agency.com", sender: "sender@agency.com", intended: "peer@warm.example" })).toBe("bounce");
    expect(routeWarmupMessage({ isBounceReport: true, reader: "other@x.com", sender: "sender@agency.com", intended: "peer@warm.example" })).toBe("foreign");
    expect(routeWarmupMessage({ isBounceReport: false, reader: "peer@warm.example", sender: "sender@agency.com", intended: "peer@warm.example" })).toBe("arrival");
  });

  it("duplicate bounce notifications map to one dedupe key per job", () => {
    expect(warmupReportExternalId("job-1", "bounced")).toBe(warmupReportExternalId("job-1", "bounced"));
    expect(warmupReportExternalId("job-1", "bounced")).not.toBe(warmupReportExternalId("job-2", "bounced"));
  });
});

describe("health reacts to confirmed negative signals", () => {
  it("one bounce in 150 sends lowers health below 100", () => {
    expect(bouncePenalty(1, 150)).toBeGreaterThanOrEqual(1);
  });
  it("one bounce in 2,000 sends still costs a point (no rounding to zero)", () => {
    expect(bouncePenalty(1, 2000)).toBe(1);
  });
  it("no bounces, no penalty; capped at 40", () => {
    expect(bouncePenalty(0, 100)).toBe(0);
    expect(bouncePenalty(50, 100)).toBe(40);
  });
  it("deferrals and rejections are penalised", () => {
    expect(softSignalPenalty(1, 0, 100)).toBe(1);
    expect(softSignalPenalty(0, 0, 100)).toBe(0);
  });
});
