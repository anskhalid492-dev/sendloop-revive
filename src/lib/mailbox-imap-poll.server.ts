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
  status: string | null;
  is_active: boolean | null;
};

export type MailboxPollOutcome = {
  mailbox: string;
  ok: boolean;
  fetched: number;
  replies: number;
  bounces: number;
  skipped: number;
  highestUid: number | null;
  error?: string;
};

export type MailboxPollSummary = {
  mailboxes: number;
  replies: number;
  bounces: number;
  skipped: number;
  failures: number;
  results: MailboxPollOutcome[];
};

const MAILBOX_BATCH = 100;

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

/** Reads one mailbox and files everything it can match. Never throws. */
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
    bounces: 0,
    skipped: 0,
    highestUid: null,
  };

  if (!row.imap_host || !row.imap_port || !row.imap_username || !row.imap_password) {
    outcome.error = "This mailbox has no incoming-mail server saved. Reconnect it.";
    console.warn(`[imap-poll] ${row.email_address}: ${outcome.error}`);
    return outcome;
  }

  let messages: RelayCheckedMessage[] = [];
  try {
    const endpoint = await imapEndpoint(admin, row);
    const { relayCheckMailbox } = await import("@/lib/mailbox-relay.server");
    const result = await relayCheckMailbox(endpoint, row.last_imap_uid ?? null);
    if (!result.ok) {
      outcome.error = result.message;
      console.warn(`[imap-poll] ${row.email_address}: check failed — ${result.message}`);
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

  const mailbox = row.email_address.trim().toLowerCase();
  const { ingestInboundEmail } = await import("@/lib/inbox.server");
  const { applyDeliveryEvent } = await import("@/lib/delivery-events.server");
  const { applyWarmupInbound } = await import("@/lib/warmup-engine.server");

  let highest = row.last_imap_uid ?? 0;

  for (const message of messages.slice().sort((a, b) => a.uid - b.uid)) {
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
      const warmupClaimed = await applyWarmupInbound({
        from: extractEmail(message.from),
        to: extractEmail(message.to) ?? mailbox,
        subject: message.subject ?? null,
        text: body.text,
        html: body.html,
        messageId: message.messageId ?? null,
        // The relay reads the main inbox, so a message found here landed in the
        // inbox rather than the spam folder.
        folder: "inbox",
        source: "imap_arrival",
        receivedAt: message.date ? new Date(message.date).toISOString() : null,
      });
      if (warmupClaimed) {
        outcome.warmup += 1;
        continue;
      }

      if (looksLikeBounce({ from: message.from, subject: message.subject })) {
        const recipient = bouncedRecipient({
          text: extractInboundBody(message.text, {
            contentType: message.contentType ?? null,
            contentTransferEncoding: message.contentTransferEncoding ?? null,
          }).text,
          subject: message.subject,
          mailbox,
        });
        if (!recipient) {
          outcome.skipped += 1;
          console.warn(
            `[imap-poll] ${row.email_address}: bounce report with no readable recipient (uid ${message.uid}).`,
          );
          continue;
        }
        // Matches the failed send by recipient address and applies the existing
        // bounce bookkeeping (message state, recipient, lead, suppression).
        const applied = await applyDeliveryEvent({
          kind: "bounced",
          email: recipient,
          providerMessageId: null,
          reason: (message.subject ?? "Delivery failure reported by the receiving server").slice(0, 500),
        });
        if (applied.status === "applied") outcome.bounces += 1;
        else {
          outcome.skipped += 1;
          console.warn(
            `[imap-poll] ${row.email_address}: bounce for ${recipient} matched no send — ${applied.reason ?? "unmatched"}.`,
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
      const result = await ingestInboundEmail(inbound);
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

  // Advance the cursor even for skipped mail, so the same messages are never
  // fetched again on the next run.
  if (highest > (row.last_imap_uid ?? 0)) {
    outcome.highestUid = highest;
    const { error } = await admin
      .from("mailboxes")
      .update({ last_imap_uid: highest })
      .eq("id", row.id);
    if (error) console.warn(`[imap-poll] ${row.email_address}: cursor not saved — ${error.message}`);
  } else {
    outcome.highestUid = row.last_imap_uid ?? null;
  }

  return outcome;
}

/** Reads every connected, active mailbox once. One failure never stops the rest. */
export async function pollConnectedMailboxes(limit = MAILBOX_BATCH): Promise<MailboxPollSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("mailboxes")
    .select(
      "id, workspace_id, email_address, imap_host, imap_port, imap_secure, imap_username, imap_password, last_imap_uid, status, is_active",
    )
    .eq("status", "connected")
    .order("last_tested_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as PollMailboxRow[]).filter(
    (row) => row.is_active !== false,
  );

  const summary: MailboxPollSummary = {
    mailboxes: rows.length,
    replies: 0,
    bounces: 0,
    skipped: 0,
    failures: 0,
    results: [],
  };

  for (const row of rows) {
    const outcome = await pollMailbox(supabaseAdmin, row);
    summary.results.push(outcome);
    summary.replies += outcome.replies;
    summary.bounces += outcome.bounces;
    summary.skipped += outcome.skipped;
    if (!outcome.ok) summary.failures += 1;
  }

  return summary;
}
