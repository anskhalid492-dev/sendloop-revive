/**
 * Reply detection for self-connected mailboxes.
 *
 * Every mailbox is read through the `mailbox-smtp-relay` edge function with the
 * customer's OWN IMAP credentials — there is deliberately no platform or shared
 * credential anywhere in this path. Nothing is sent, moved or deleted; this file
 * only reads mail and hands matched replies to the existing Unified Inbox
 * ingestion (`ingestInboundEmail`) and bounces to the existing delivery-event
 * processor (`applyDeliveryEvent`).
 *
 * A mailbox is only polled while it is `status = 'connected'` AND `is_active`.
 * Failures are recorded per mailbox and never stop the loop.
 */
import { originalMessageIdFromBounce, warmupKindForReport } from "@/lib/delivery-lifecycle";
import { parseDeliveryReport } from "@/lib/dsn-parse";
import { extractInboundBody } from "@/lib/inbound-body";
import {

  bouncedRecipient,
  extractDisplayName,
  extractEmail,
  looksLikeBounce,
  splitReferences,
} from "@/lib/mailbox-inbound-classify";
import type { RelayCheckedMessage } from "@/lib/mailbox-relay.server";

type PollMailboxRow = {
  id: string;
  workspace_id: string;
  email_address: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  imap_username: string | null;
  imap_password: string | null;
  last_imap_uid: number | null;
  /** Cursor for the spam/junk folder. Missing on older schemas. */
  last_spam_imap_uid?: number | null;
  status: string | null;
  is_active: boolean | null;
};

export type MailboxPollOutcome = {
  mailbox: string;
  ok: boolean;
  fetched: number;
  replies: number;
  /** Warmup arrivals confirmed from this mailbox (never shown in the inbox). */
  warmup: number;
  bounces: number;
  skipped: number;
  highestUid: number | null;
  /** Messages read from the spam/junk folder in this run. */
  spamFetched?: number;
  spamFolder?: string | null;
  spamHighestUid?: number | null;
  error?: string;
};

export type MailboxPollSummary = {
  mailboxes: number;
  replies: number;
  warmup: number;
  bounces: number;
  skipped: number;
  failures: number;
  results: MailboxPollOutcome[];
  locked?: boolean;
  /** Mailboxes left for the next run because the time budget ran out. */
  deferred?: number;
};

const MAILBOX_BATCH = 100;
/** Conservative cap on simultaneous IMAP connections per run. */
const POLL_CONCURRENCY = 4;
const POLL_LEASE_KEY = "mailbox_poll_lease";
/** Longer than any single run; a crashed run frees the lease after this. */
const POLL_LEASE_MS = 10 * 60_000;

/** Turns one relay message into the shape the Unified Inbox ingestion expects. */
export function inboundFromRelayMessage(message: RelayCheckedMessage, mailbox: string) {
  const from = extractEmail(message.from);
  const received = message.date ? new Date(message.date) : null;
  // IMAP hands over the raw MIME body. Boundary lines, part headers and
  // quoted-printable/base64 encoding are stripped here — the same shared step
  // every inbound path uses — so only the real message text is ever stored.
  const body = extractInboundBody(message.text, {
    contentType: message.contentType ?? null,
    contentTransferEncoding: message.contentTransferEncoding ?? null,
  });
  return {
    from: from ?? "",
    fromName: extractDisplayName(message.from),
    to: extractEmail(message.to) ?? mailbox,
    // The mailbox actually polled: used to resolve the workspace when the To
    // address is a third party (forwards, Bcc), and to keep unrelated mail out
    // of the unmatched-inbound alert feed.
    deliveredTo: mailbox,
    recordUnmatched: false,
    cc: [] as string[],
    subject: message.subject ?? null,
    text: body.text,
    html: body.html,
    messageId: message.messageId ?? null,
    inReplyTo: message.inReplyTo ?? null,
    references: splitReferences(message.references),
    receivedAt: received && !Number.isNaN(received.getTime()) ? received.toISOString() : null,
    headers: null as Record<string, string> | null,
    attachments: [] as never[],
  };
}

async function imapEndpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: PollMailboxRow,
) {
  const { data: password, error } = await admin.rpc("mailbox_read_secret", {
    _id: row.imap_password,
  });
  if (error || !password) {
    throw new Error("The saved mailbox password could not be read. Reconnect the mailbox.");
  }
  return {
    host: row.imap_host as string,
    port: row.imap_port as number,
    security: (row.imap_secure ? "ssl" : "tls") as "ssl" | "tls",
    username: row.imap_username as string,
    password: String(password),
  };
}

/**
 * Files one folder's worth of mail. Returns the highest UID seen.
 *
 * `placement` tells warmup where its own mail landed ("inbox" or "spam"); it
 * changes nothing about how real replies are handled — a genuine reply counts
 * the same whether the mail host filed it in the inbox or in Junk.
 */
async function processFolderMessages(
  row: PollMailboxRow,
  messages: RelayCheckedMessage[],
  placement: "inbox" | "spam",
  startUid: number,
  outcome: MailboxPollOutcome,
): Promise<number> {
  const mailbox = row.email_address.trim().toLowerCase();
  const { ingestInboundEmail } = await import("@/lib/inbox.server");
  const { applyDeliveryEvent } = await import("@/lib/delivery-events.server");
  const { applyWarmupInbound } = await import("@/lib/warmup-engine.server");

  let highest = startUid;

  for (const message of messages.slice().sort((a, b) => a.uid - b.uid)) {
    // Mail at or below the saved position was already handled on an earlier run.
    // Some mail servers ignore the "since" filter and hand back the newest
    // messages regardless, which previously made the same failure report count
    // again on every single check.
    if (startUid > 0 && message.uid <= startUid) continue;
    if (message.uid > highest) highest = message.uid;

    try {
      // Warmup mail that arrives in a connected mailbox is the strongest
      // delivery confirmation warmup has: our own message came back to us. It
      // is claimed here — before any inbox handling — so warmup traffic never
      // reaches the Unified Inbox and the arrival is counted once.
      const body = extractInboundBody(message.text, {
        contentType: message.contentType ?? null,
        contentTransferEncoding: message.contentTransferEncoding ?? null,
      });
      // Delivery-failure reports are parsed up front so warmup can attribute a
      // report that quotes its own email to the exact warmup job.
      const isBounceReport = looksLikeBounce({ from: message.from, subject: message.subject });
      const report = isBounceReport ? parseDeliveryReport({ text: body.text, subject: message.subject }) : null;
      const warmupClaimed = await applyWarmupInbound({
        bounceReport: report ? { kind: report.kind, reason: report.reason, status: report.status } : null,
        from: extractEmail(message.from),
        to: extractEmail(message.to) ?? mailbox,
        subject: message.subject ?? null,
        text: body.text,
        html: body.html,
        messageId: message.messageId ?? null,
        // Which folder this run is reading: warmup records real placement.
        folder: placement,
        source: "imap_arrival",
        receivingMailbox: mailbox,
        receivedAt: message.date ? new Date(message.date).toISOString() : null,
      });
      if (warmupClaimed) {
        outcome.warmup += 1;
        continue;
      }

      if (isBounceReport && report) {
        const recipient = bouncedRecipient({
          text: body.text,
          subject: message.subject,
          mailbox,
        });
        // The original Message-ID quoted in the report is the reliable link to
        // the exact send; the recipient address is only a fallback.
        const originalId = originalMessageIdFromBounce(body.text ?? message.text, message.messageId ?? null);
        if (originalId) {
          const { applyWarmupDeliveryEvent } = await import("@/lib/warmup-engine.server");
          const warmupKind = warmupKindForReport(report.kind);
          const matchedWarmup = await applyWarmupDeliveryEvent({
            kind: warmupKind,
            providerMessageId: originalId,
            email: recipient,
            reason: report.reason,
            externalId: `report:${originalId.toLowerCase()}:${warmupKind}`,
            payload: { source: "imap_bounce_report", status: report.status ?? null },
          });
          if (matchedWarmup) {
            outcome.warmup += 1;
            continue;
          }
        }
        if (!recipient && !originalId) {
          outcome.skipped += 1;
          console.warn(
            `[imap-poll] ${row.email_address}: bounce report with no readable recipient (uid ${message.uid}).`,
          );
          continue;
        }
        // Only explicit invalid-recipient evidence is a bounce. Sender-policy
        // refusals (including 550 5.7.x) are failed sends: the reason is kept,
        // but a valid recipient is not labelled or suppressed as bounced.
        let applied = await applyDeliveryEvent({
          kind: report.kind,
          email: recipient,
          providerMessageId: originalId,
          reason: report.reason,
        });
        // Quoted id unknown (some servers rewrite it): fall back to the
        // previous recipient-address match.
        if (applied.status !== "applied" && originalId && recipient) {
          applied = await applyDeliveryEvent({
            kind: report.kind,
            email: recipient,
            providerMessageId: null,
            reason: report.reason,
          });
        }
        if (applied.status === "applied") {
          if (report.kind === "bounced") outcome.bounces += 1;
          else outcome.skipped += 1;
        } else {
          outcome.skipped += 1;
          console.warn(
            `[imap-poll] ${row.email_address}: ${report.kind} for ${recipient ?? originalId} matched no send — ${applied.reason ?? "unmatched"}.`,
          );
        }
        continue;
      }

      const inbound = inboundFromRelayMessage(message, mailbox);
      if (!inbound.from) {
        outcome.skipped += 1;
        continue;
      }
      // Threads on In-Reply-To / References against the stored outbound ids
      // first, then on the sender address; unmatched mail is never surfaced.
      let result;
      try {
        result = await ingestInboundEmail(inbound);
      } catch (error) {
        const { recordFailedMailboxInbound } = await import("@/lib/email-events.server");
        await recordFailedMailboxInbound(inbound, error instanceof Error ? error.message : "Reply processing failed");
        throw error;
      }
      if (result.status === "unmatched") {
        outcome.skipped += 1;
        continue;
      }
      outcome.replies += 1;
    } catch (error) {
      outcome.skipped += 1;
      console.warn(
        `[imap-poll] ${row.email_address}: uid ${message.uid} could not be processed — ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  return highest;
}

/**
 * Reads one folder through the relay. Returns null when the folder could not be
 * opened (common for the spam folder: not every host has one).
 */
async function readFolder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: PollMailboxRow,
  sinceUid: number | null,
  folders?: string[],
): Promise<{ ok: boolean; message: string; folder?: string | null; messages: RelayCheckedMessage[] }> {
  const endpoint = await imapEndpoint(admin, row);
  const { relayCheckMailbox } = await import("@/lib/mailbox-relay.server");
  return relayCheckMailbox(endpoint, sinceUid, folders);
}

/**
 * Reads one mailbox and files everything it can match. Never throws.
 *
 * Both the main inbox AND the spam/junk folder are read: mail hosts routinely
 * file genuine replies (and bounce reports) as junk, and mail that is never read
 * can never reach the Unified Inbox. Each folder keeps its own UID cursor, so no
 * message is processed twice.
 */
export async function pollMailbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: PollMailboxRow,
): Promise<MailboxPollOutcome> {
  const outcome: MailboxPollOutcome = {
    mailbox: row.email_address,
    ok: false,
    fetched: 0,
    replies: 0,
    warmup: 0,
    bounces: 0,
    skipped: 0,
    highestUid: null,
  };

  if (!row.imap_host || !row.imap_port || !row.imap_username || !row.imap_password) {
    outcome.error = "This mailbox has no incoming-mail server saved. Reconnect it.";
    console.warn(`[imap-poll] ${row.email_address}: ${outcome.error}`);
    return outcome;
  }

  // ---- main inbox -------------------------------------------------------
  let messages: RelayCheckedMessage[] = [];
  // Stamp the poll time so the batch rotates: the cron orders by this column,
  // and without it mailboxes beyond the first batch would never be checked.
  await admin.from("mailboxes").update({ last_tested_at: new Date().toISOString() }).eq("id", row.id);
  try {
    const result = await readFolder(admin, row, row.last_imap_uid ?? null);
    if (!result.ok) {
      outcome.error = result.message;
      console.warn(`[imap-poll] ${row.email_address}: check failed — ${result.message}`);
      // Never change mailboxes.status here: sending (SMTP) only uses
      // status='connected', and an incoming-mail login problem must not
      // switch off outbound sending for this mailbox.
      return outcome;
    }
    messages = result.messages;
  } catch (error) {
    outcome.error = error instanceof Error ? error.message : "IMAP check failed";
    console.warn(`[imap-poll] ${row.email_address}: ${outcome.error}`);
    return outcome;
  }

  outcome.ok = true;
  outcome.fetched = messages.length;

  const inboxHighest = await processFolderMessages(
    row,
    messages,
    "inbox",
    row.last_imap_uid ?? 0,
    outcome,
  );

  // Advance the cursor even for skipped mail, so the same messages are never
  // fetched again on the next run.
  if (inboxHighest > (row.last_imap_uid ?? 0)) {
    outcome.highestUid = inboxHighest;
    const { error } = await admin
      .from("mailboxes")
      .update({ last_imap_uid: inboxHighest })
      .eq("id", row.id);
    if (error) console.warn(`[imap-poll] ${row.email_address}: cursor not saved — ${error.message}`);
  } else {
    outcome.highestUid = row.last_imap_uid ?? null;
  }

  // ---- spam / junk folder ----------------------------------------------
  // A missing cursor column (older schema) means nothing can be remembered
  // between runs, so only idempotent handling is allowed there: replies are
  // de-duplicated on Message-ID and warmup arrivals are counted once, while
  // bounce reports are left for the run after the column exists.
  const spamCursorKnown = row.last_spam_imap_uid !== undefined;
  try {
    const { SPAM_FOLDER_CANDIDATES } = await import("@/lib/mailbox-relay.server");
    const spam = await readFolder(
      admin,
      row,
      row.last_spam_imap_uid ?? null,
      SPAM_FOLDER_CANDIDATES,
    );
    // Older relay builds ignore the folder request and silently return INBOX
    // again. They echo no folder name, so anything without a confirmed junk
    // folder is skipped rather than processed twice.
    const confirmed =
      typeof spam.folder === "string" && spam.folder.length > 0 && spam.folder.toUpperCase() !== "INBOX";
    if (spam.ok && confirmed) {
      outcome.spamFolder = spam.folder ?? null;
      outcome.spamFetched = spam.messages.length;
      const spamHighest = await processFolderMessages(
        row,
        spam.messages,
        "spam",
        row.last_spam_imap_uid ?? 0,
        outcome,
      );
      outcome.spamHighestUid = spamHighest;
      if (spamCursorKnown && spamHighest > (row.last_spam_imap_uid ?? 0)) {
        const { error } = await admin
          .from("mailboxes")
          .update({ last_spam_imap_uid: spamHighest })
          .eq("id", row.id);
        // 42703 / PGRST204: the column is not deployed yet — not a failure.
        if (error && error.code !== "42703" && error.code !== "PGRST204") {
          console.warn(`[imap-poll] ${row.email_address}: junk cursor not saved — ${error.message}`);
        }
      }
    } else {
      outcome.spamFolder = null;
      outcome.spamFetched = 0;
    }
  } catch (error) {
    // The junk folder is best-effort: never let it fail the mailbox.
    console.warn(
      `[imap-poll] ${row.email_address}: junk folder not read — ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  return outcome;
}

/** Reads every connected, active mailbox once. One failure never stops the rest. */
export async function pollConnectedMailboxes(limit = MAILBOX_BATCH): Promise<MailboxPollSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { acquireWorkerLease, releaseWorkerLease, logWorkerRun } = await import("./worker-lease.server");
  const startedAt = Date.now();
  // Single-flight: an overlapping tick exits instead of reading the same
  // mailboxes twice and doubling IMAP and database load.
  const lease = await acquireWorkerLease(supabaseAdmin, POLL_LEASE_KEY, POLL_LEASE_MS);
  if (!lease) {
    logWorkerRun({ worker: "mailbox-worker", startedAt, result: "skipped", reason: "locked" });
    return { mailboxes: 0, replies: 0, warmup: 0, bounces: 0, skipped: 0, failures: 0, results: [], locked: true } as MailboxPollSummary;
  }
  try {
    const summary = await pollWithLease(supabaseAdmin, limit);
    logWorkerRun({
      worker: "mailbox-worker",
      startedAt,
      result: "ok",
      mailboxes: summary.mailboxes,
      replies: summary.replies,
      bounces: summary.bounces,
      failures: summary.failures,
    });
    return summary;
  } catch (error) {
    logWorkerRun({ worker: "mailbox-worker", startedAt, result: "error", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await releaseWorkerLease(supabaseAdmin, lease);
  }
}

/**
 * The mailboxes one polling run reads: connected, active, least-recently
 * checked first (rotation), capped at `limit`. Shared by legacy and queue mode
 * so both select exactly the same work. `ids` narrows to specific mailboxes
 * (queue jobs re-read their mailbox so a disconnect since enqueue is honoured).
 */
export async function loadPollableMailboxes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  limit: number = MAILBOX_BATCH,
  ids?: string[],
): Promise<PollMailboxRow[]> {
  const BASE_COLUMNS =
    "id, workspace_id, email_address, imap_host, imap_port, imap_secure, imap_username, imap_password, last_imap_uid, status, is_active";

  const select = (columns: string) => {
    let q = supabaseAdmin.from("mailboxes").select(columns).eq("status", "connected");
    if (ids) q = q.in("id", ids);
    return q.order("last_tested_at", { ascending: true, nullsFirst: true }).limit(limit);
  };

  // The junk-folder cursor is additive: on schemas without it the query falls
  // back to the original column list instead of failing the whole run.
  let { data, error } = await select(`${BASE_COLUMNS}, last_spam_imap_uid`);
  if (error && (error.code === "42703" || error.code === "PGRST204" || /last_spam_imap_uid/.test(error.message))) {
    ({ data, error } = await select(BASE_COLUMNS));
  }
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as PollMailboxRow[]).filter((row) => row.is_active !== false);
}

/**
 * Background runs are terminated at roughly 30s. Only start new mailbox work
 * before this much time has elapsed; in-flight IMAP reads are never cut off.
 */
const RUN_BUDGET_MS = 20_000;

/**
 * Reads rows with at most `concurrency` in flight. Each worker checks the
 * elapsed time before STARTING its next mailbox; a mailbox already being read
 * always finishes. Unstarted rows are returned as `deferred` (not failures).
 */
export async function pollRowsWithinBudget(
  rows: PollMailboxRow[],
  poll: (row: PollMailboxRow) => Promise<MailboxPollOutcome>,
  opts: { budgetMs?: number; now?: () => number; concurrency?: number } = {},
): Promise<{ results: MailboxPollOutcome[]; deferred: number }> {
  const now = opts.now ?? (() => Date.now());
  const budgetMs = opts.budgetMs ?? RUN_BUDGET_MS;
  const startedAt = now();
  const results: MailboxPollOutcome[] = [];
  let next = 0;
  const worker = async () => {
    while (next < rows.length && now() - startedAt < budgetMs) {
      const row = rows[next++]!;
      results.push(await poll(row));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? POLL_CONCURRENCY, rows.length) }, worker));
  return { results, deferred: rows.length - next };
}

export { MAILBOX_BATCH, POLL_CONCURRENCY, POLL_LEASE_KEY, POLL_LEASE_MS, RUN_BUDGET_MS };
export type { PollMailboxRow };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollWithLease(supabaseAdmin: any, limit: number): Promise<MailboxPollSummary> {
  const rows = await loadPollableMailboxes(supabaseAdmin, limit);

  const summary: MailboxPollSummary = {
    mailboxes: rows.length,
    replies: 0,
    warmup: 0,
    bounces: 0,
    skipped: 0,
    failures: 0,
    results: [],
  };

  // Mailboxes are read several at a time so one slow mail server can never
  // hold up the rest. A run only STARTS new mailboxes inside RUN_BUDGET_MS so it
  // ends (and releases its lease) before the platform's ~30s background limit;
  // unreached mailboxes keep their old last_tested_at and lead the next run.
  const { results, deferred } = await pollRowsWithinBudget(rows, (row) => pollMailbox(supabaseAdmin, row));
  for (const outcome of results) {
    summary.results.push(outcome);
    summary.replies += outcome.replies;
    summary.warmup += outcome.warmup;
    summary.bounces += outcome.bounces;
    summary.skipped += outcome.skipped;
    if (!outcome.ok) summary.failures += 1;
  }
  summary.deferred = deferred;
  summary.mailboxes = results.length;

  return summary;
}
