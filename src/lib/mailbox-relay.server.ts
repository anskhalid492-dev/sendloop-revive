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
import { SUPABASE_URL, getServiceRoleKey } from "@/integrations/supabase/config";
import type {
  MailEndpoint,
  MailboxTestResult,
  ProtocolResult,
} from "@/lib/mailbox-connection.server";

export type RelaySendMessage = {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
};

export type RelaySendResult = { ok: boolean; message: string; messageId: string | null };

const RELAY_URL = `${SUPABASE_URL}/functions/v1/mailbox-smtp-relay`;
const RELAY_TIMEOUT_MS = 60_000;

/** The relay can only be called when the service-role key is available. */
export function relayConfigured(): boolean {
  return !!getServiceRoleKey();
}

async function callRelay<T>(body: Record<string, unknown>): Promise<T> {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) throw new Error("Mail relay is not configured (missing service role key).");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
  const relaySecret =
    typeof process !== "undefined" ? process.env?.["MAILBOX_RELAY_SECRET"] : undefined;
  if (relaySecret) headers["x-relay-secret"] = relaySecret;

  const response = await fetch(RELAY_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
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
): Promise<RelaySendResult> {
  return callRelay<RelaySendResult>({ action: "send", smtp, message });
}
