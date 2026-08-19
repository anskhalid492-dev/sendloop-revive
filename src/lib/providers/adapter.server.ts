/**
 * Provider abstraction layer.
 *
 * Everything above this file (campaign engine, queue, sending accounts) only
 * ever deals with a `sending_account_id`. Provider-specific behaviour lives
 * here and nowhere else, so a provider can be swapped without touching the
 * rest of Sendloop.
 */
import {
  decryptCredentials,
  sendProviderEmail,
  testProviderCredentials,
  type ProviderTestResult,
} from "@/lib/provider-credentials.server";

export type Credentials = Record<string, string>;

export type OutboundMessage = {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  to: string;
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  text: string;
  html?: string;
  attachments?: { name: string; url?: string | undefined; content?: string | undefined }[] | undefined;
  headers?: Record<string, string> | undefined;
};


export type SendResult = {
  ok: boolean;
  messageId?: string | undefined;
  requestId?: string | undefined;
  statusCode?: number | undefined;
  providerResponse?: string | undefined;
  message: string;
};

export type NormalizedEvent = {
  type: "delivered" | "bounced" | "complained" | "opened" | "clicked" | "unsubscribed" | "unknown";
  email: string | null;
  messageId: string | null;
  reason: string | null;
};

export type ProviderAdapter = {
  id: string;
  validateConnection(credentials: Credentials): Promise<ProviderTestResult>;
  sendEmail(credentials: Credentials, message: OutboundMessage): Promise<SendResult>;
  getSendingLimit(credentials: Credentials): Promise<{ daily: number | null }>;
  processWebhook(payload: unknown): NormalizedEvent;
};

function normalizeEvent(payload: unknown): NormalizedEvent {
  const p = (payload ?? {}) as Record<string, unknown>;
  const raw = String(p["type"] ?? p["event"] ?? p["RecordType"] ?? "").toLowerCase();
  const email =
    (p["email"] as string) ??
    (p["recipient"] as string) ??
    (p["Recipient"] as string) ??
    (p["to"] as string) ??
    null;
  const messageId =
    (p["message_id"] as string) ??
    (p["MessageID"] as string) ??
    (p["messageId"] as string) ??
    null;

  const type: NormalizedEvent["type"] = raw.includes("bounce")
    ? "bounced"
    : raw.includes("complain") || raw.includes("spam")
      ? "complained"
      : raw.includes("deliver")
        ? "delivered"
        : raw.includes("open")
          ? "opened"
          : raw.includes("click")
            ? "clicked"
            : raw.includes("unsub")
              ? "unsubscribed"
              : "unknown";

  return {
    type,
    email,
    messageId,
    reason: (p["reason"] as string) ?? (p["Description"] as string) ?? null,
  };
}

function makeAdapter(id: string): ProviderAdapter {
  return {
    id,
    validateConnection: (credentials) => testProviderCredentials(id, credentials),
    async sendEmail(credentials, message) {
      const result = await sendProviderEmail(id, credentials, message);
      return {
        ok: result.ok,
        message: result.message,
        messageId: result.messageId,
        requestId: result.requestId,
        statusCode: result.statusCode,
        providerResponse: result.providerResponse,
      };
    },
    async getSendingLimit() {
      return { daily: null };
    },
    processWebhook: normalizeEvent,
  };
}

const adapters = new Map<string, ProviderAdapter>(
  ["ses", "resend", "emailit", "mailgun", "postmark", "brevo", "zeptomail", "sendgrid", "smtp"].map(
    (id) => [id, makeAdapter(id)],
  ),
);

export function getAdapter(provider: string): ProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) throw new Error(`No adapter registered for provider "${provider}"`);
  return adapter;
}

/** Decrypts stored provider credentials for use by an adapter. */
export function readCredentials(ciphertext: string): Credentials {
  return decryptCredentials<Credentials>(ciphertext);
}
