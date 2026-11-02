/**
 * Delivery lifecycle helpers shared by campaign sending, warmup and IMAP
 * bounce handling. Pure, client-safe, no I/O.
 */
import { classifyEmailOutcome } from "@/lib/email-outcome";

/* ------------------------------------------------ provider-call timing */

/**
 * The platform kills a worker invocation at ~30s. A provider call that is
 * still running at that moment leaves the row in `provider_call` with no
 * outcome, and recovery must hold it as outcome-unknown. So a call may only
 * START when it can finish (or time out cleanly) before the kill.
 */
export const PLATFORM_LIMIT_MS = 30_000;
/** Max time one SMTP relay send may take before it is aborted. */
export const RELAY_SEND_TIMEOUT_MS = 12_000;
/** Time kept after a send to persist its outcome. */
export const POST_SEND_RESERVE_MS = 3_000;
/** Latest offset from run start at which a provider call may begin. */
export const PROVIDER_CALL_CUTOFF_MS = PLATFORM_LIMIT_MS - RELAY_SEND_TIMEOUT_MS - POST_SEND_RESERVE_MS;

export type ProviderCallDecision = "send" | "defer_run_cutoff" | "defer_slow_mailbox";

/**
 * Before contacting the provider: send, or hand the row back untouched (the
 * provider was never contacted, so requeueing can never duplicate).
 */
export function decideProviderCall(args: {
  nowMs: number;
  cutoffAtMs: number | null;
  mailboxId: string | null;
  slowMailboxes: ReadonlySet<string>;
}): ProviderCallDecision {
  if (args.mailboxId && args.slowMailboxes.has(args.mailboxId)) return "defer_slow_mailbox";
  if (args.cutoffAtMs !== null && args.nowMs >= args.cutoffAtMs) return "defer_run_cutoff";
  return "send";
}

/** Provider-call cutoff derived from a run deadline set at start + budget. */
export function providerCutoffFromDeadline(deadlineAtMs: number, budgetMs: number): number {
  return deadlineAtMs - budgetMs + Math.min(PROVIDER_CALL_CUTOFF_MS, budgetMs);
}

/* ------------------------------------------------ readable failure reasons */

export type SendFailureCategory =
  | "outcome_unknown"
  | "timeout_before_send"
  | "connection"
  | "auth"
  | "sender_blocked"
  | "deferred"
  | "rejected"
  | "bounced"
  | "configuration"
  | "other";

export type SendFailureDescription = {
  category: SendFailureCategory;
  label: string;
  /** e.g. "550 5.1.1" */
  code: string | null;
};

export function describeSendFailure(raw: string | null | undefined): SendFailureDescription | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const verdict = classifyEmailOutcome(text);
  const code = [verdict.smtpCode, verdict.enhancedCodes[0]].filter(Boolean).join(" ") || null;
  const t = text.toLowerCase();

  if (verdict.outcome === "unknown" || /aborted due to timeout|timeouterror|operation was aborted|unreadable response/.test(t)) {
    return {
      category: "outcome_unknown",
      label: "Outcome unknown — the mail server did not confirm in time. Held for review and not resent, because it may already have been delivered.",
      code,
    };
  }
  if (/econnrefused|enotfound|getaddrinfo|connection refused|could not connect|certificate|tls handshake/.test(t)) {
    return { category: "connection", label: "Could not connect to the mailbox's mail server. Nothing was sent.", code };
  }
  if (/\b535\b|authentication|auth failed|invalid login|username and password|login failed/.test(t)) {
    return { category: "auth", label: "Mailbox sign-in was refused by the mail server. Reconnect the mailbox.", code };
  }
  if (verdict.outcome === "bounced") {
    return { category: "bounced", label: "Bounced — the recipient address or mailbox does not exist.", code };
  }
  if (verdict.outcome === "delayed") {
    return { category: "deferred", label: "Temporarily deferred by the receiving server.", code };
  }
  if (verdict.reason === "sender_side") {
    return { category: "sender_blocked", label: "Refused because of the sending mailbox or its provider (sending disabled, policy or reputation block).", code };
  }
  if (/no connected mailbox|paused|not configured|domain not verified/.test(t)) {
    return { category: "configuration", label: "No usable sending mailbox for this sender.", code };
  }
  if (verdict.smtpCode && verdict.smtpCode.startsWith("5")) {
    return { category: "rejected", label: "Rejected by the receiving server.", code };
  }
  return null;
}

/* ------------------------------------------------ bounce report matching */

/**
 * The ORIGINAL message's Message-ID quoted inside a bounce report (the
 * returned headers part). The report's own Message-ID is excluded.
 */
export function originalMessageIdFromBounce(text: string | null | undefined, reportMessageId?: string | null): string | null {
  const body = text ?? "";
  const own = (reportMessageId ?? "").trim().toLowerCase();
  const patterns = [
    /^\s*(?:x-)?original-message-id:\s*(<[^>\s]+>)/gim,
    /^\s*message-id:\s*(<[^>\s]+>)/gim,
  ];
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      const id = m[1]!;
      if (id.toLowerCase() !== own) return id;
    }
  }
  return null;
}

export type WarmupReportKind = "bounced" | "deferred" | "rejected";

/** Maps a parsed DSN verdict onto warmup's event kinds. */
export function warmupKindForReport(kind: "bounced" | "delayed" | "failed"): WarmupReportKind {
  return kind === "bounced" ? "bounced" : kind === "delayed" ? "deferred" : "rejected";
}

/**
 * How a token-matched warmup message read from IMAP must be treated:
 *  - a bounce report read in the SENDING mailbox → bounce for that job
 *  - a normal message read in the addressed mailbox → arrival
 *  - anything else → claimed (kept out of the inbox) but not counted
 */
export function routeWarmupMessage(args: {
  isBounceReport: boolean;
  reader: string | null;
  sender: string | null;
  intended: string | null;
}): "bounce" | "arrival" | "foreign" {
  const reader = (args.reader ?? "").trim().toLowerCase();
  const sender = (args.sender ?? "").trim().toLowerCase();
  const intended = (args.intended ?? "").trim().toLowerCase();
  if (args.isBounceReport) return !reader || !sender || reader === sender ? "bounce" : "foreign";
  if (reader && intended && reader !== intended) return "foreign";
  return "arrival";
}

/** Stable dedupe key: one recorded bounce/deferral/rejection per warmup job. */
export function warmupReportExternalId(jobId: string, kind: WarmupReportKind): string {
  return `report:${jobId}:${kind}`;
}

/* ------------------------------------------------ health */

/**
 * Bounce penalty for the health score. Any confirmed bounce costs at least one
 * point, so a real bounce can never leave the score at 100 through rounding.
 */
export function bouncePenalty(bounced: number, sent: number): number {
  if (bounced <= 0 || sent <= 0) return 0;
  const rate = (bounced / sent) * 100;
  return Math.min(40, Math.max(1, Math.round(rate * 4)));
}

/** Deferrals and provider rejections are weaker negative signals. */
export function softSignalPenalty(deferred: number, rejected: number, sent: number): number {
  const events = Math.max(0, deferred) + Math.max(0, rejected);
  if (events <= 0 || sent <= 0) return 0;
  const rate = (events / sent) * 100;
  return Math.min(15, Math.max(1, Math.round(rate)));
}
