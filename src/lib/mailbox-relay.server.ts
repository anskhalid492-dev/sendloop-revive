/**
 * HTTPS client for the `mailbox-smtp-relay` Supabase Edge Function.
 *
 * The app runs on Cloudflare Workers, which blocks outbound connections to
 * Cloudflare's own IP ranges — so mail servers hosted behind Cloudflare
 * (Hostinger and similar) can never be reached with a direct socket from here.
 * The relay runs on Deno, which has no such restriction, and performs the real
 * SMTP/IMAP work on our behalf.
 *
 * Server-only. Authenticated with the project's service-role key, plus the
 * optional MAILBOX_RELAY_SECRET shared secret when configured on both sides.
 *
 * Deployable function source: docs/edge-functions/mailbox-smtp-relay/index.ts
 */
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  getServiceRoleKey,
} from "@/integrations/supabase/config";
import type {
  MailEndpoint,
  MailboxTestResult,
  ProtocolResult,
} from "@/lib/mailbox-connection.server";

export type RelayAttachment = { filename: string; contentType: string; contentBase64: string };

export type RelaySendMessage = {
  from: string;
  fromName?: string;
  /** Visible To header, and the default delivery recipient. */
  to: string;
  /**
   * Every delivery target for this ONE message: To + Cc + Bcc. Bcc addresses
   * belong here and nowhere else, so they stay invisible to other recipients.
   */
  envelopeTo?: string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: RelayAttachment[];
};


export type RelaySendResult = { ok: boolean; message: string; messageId: string | null };

const RELAY_URL = `${SUPABASE_URL}/functions/v1/mailbox-smtp-relay`;
const RELAY_TIMEOUT_MS = 60_000;

function getRelaySecret(): string | undefined {
  const value = typeof process !== "undefined" ? process.env?.["MAILBOX_RELAY_SECRET"] : undefined;
  return value && value.length > 0 ? value : undefined;
}

/** The relay needs the shared secret (or, as a fallback, the service-role key). */
export function relayConfigured(): boolean {
  return !!getRelaySecret() || !!getServiceRoleKey();
}

async function callRelay<T>(body: Record<string, unknown>, timeoutMs: number = RELAY_TIMEOUT_MS): Promise<T> {
  const relaySecret = getRelaySecret();
  const serviceRoleKey = getServiceRoleKey();
  if (!relaySecret && !serviceRoleKey) {
    throw new Error("Mail relay is not configured (missing relay secret).");
  }

  // The functions gateway requires a project key in the Authorization header;
  // the relay itself authenticates the caller with the shared secret.
  const gatewayKey = SUPABASE_PUBLISHABLE_KEY;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${gatewayKey}`,
    apikey: gatewayKey,
  };
  if (relaySecret) headers["x-relay-secret"] = relaySecret;
  else if (serviceRoleKey) headers["x-service-role-key"] = serviceRoleKey;

  const response = await fetch(RELAY_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mail relay returned ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Mail relay returned an unreadable response: ${text.slice(0, 200)}`);
  }
}

/** Runs both logins through the relay. Result shape matches the direct tester. */
export async function relayTestMailboxEndpoints(
  smtp: MailEndpoint,
  imap: MailEndpoint,
): Promise<MailboxTestResult> {
  const result = await callRelay<{
    ok: boolean;
    smtp: ProtocolResult;
    imap: ProtocolResult;
    testedAt?: string;
  }>({ action: "test", smtp, imap });

  if (!result?.smtp || !result?.imap) {
    throw new Error("Mail relay returned an incomplete test result.");
  }

  return {
    ok: !!result.ok,
    smtp: result.smtp,
    imap: result.imap,
    testedAt: result.testedAt ?? new Date().toISOString(),
  };
}

/** Sends one message through a customer mailbox's own SMTP server. */
export async function relaySendMail(
  smtp: MailEndpoint,
  message: RelaySendMessage,
  options?: { timeoutMs?: number },
): Promise<RelaySendResult> {
  // Callers inside a time-limited worker pass a timeout that finishes before
  // the platform kill, so an abort is recorded instead of the run dying.
  return callRelay<RelaySendResult>({ action: "send", smtp, message }, options?.timeoutMs ?? RELAY_TIMEOUT_MS);
}

export type RelayCheckedMessage = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  /** Raw MIME body as fetched; parsed by `@/lib/inbound-body`. */
  text: string | null;
  /** Present once the relay is redeployed; lets the parser skip guessing. */
  contentType?: string | null;
  contentTransferEncoding?: string | null;
};

export type RelayCheckResult = {
  ok: boolean;
  message: string;
  /** Folder actually opened. Null on older relay builds that only read INBOX. */
  folder?: string | null;
  messages: RelayCheckedMessage[];
};

/** Names mail hosts use for the spam folder, tried in order. */
export const SPAM_FOLDER_CANDIDATES = [
  "INBOX.Junk",
  "Junk",
  "INBOX.spam",
  "Spam",
  "INBOX.Spam",
  "Junk E-mail",
  "[Gmail]/Spam",
];

/**
 * Reads new mail from a customer mailbox's OWN IMAP folder through the relay.
 * `sinceUid` is the highest UID already processed; null asks for the most recent
 * slice. `folders` lists candidate folder names (first one that opens wins);
 * omitted means INBOX. Read-only: nothing is sent, moved or deleted.
 */
export async function relayCheckMailbox(
  imap: MailEndpoint,
  sinceUid: number | null,
  folders?: string[],
): Promise<RelayCheckResult> {
  const result = await callRelay<RelayCheckResult>({
    action: "check",
    imap,
    sinceUid,
    ...(folders && folders.length > 0 ? { folder: folders } : {}),
  });
  return {
    ok: !!result?.ok,
    message: result?.message ?? "The mail relay returned no result.",
    folder: result?.folder ?? null,
    messages: Array.isArray(result?.messages) ? result.messages : [],
  };
}
