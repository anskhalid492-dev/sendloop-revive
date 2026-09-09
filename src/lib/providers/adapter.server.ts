/**
 * Provider abstraction layer.
 *
 * Everything above this file (campaign engine, queue, sending accounts) only
 * ever deals with a `sending_account_id`. Provider-specific behaviour lives
 * here and nowhere else, so a provider can be swapped without touching the
 * rest of MunchReach.
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
  rfcMessageId?: string | undefined;
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

export type DomainRegistration = {
  supported: boolean;
  status: "verified" | "pending" | "unsupported" | "error";
  detail: string;
};

/**
 * The generic managed sending interface. Nothing above this layer may know
 * which concrete provider (Resend, SES, Mailgun, ...) is in use.
 */
export type ProviderAdapter = {
  id: string;
  validateConnection(credentials: Credentials): Promise<ProviderTestResult>;
  /** Confirms the provider will accept mail from this sender address. */
  validateSender(credentials: Credentials, fromEmail: string): Promise<{ ok: boolean; detail: string }>;
  sendEmail(credentials: Credentials, message: OutboundMessage): Promise<SendResult>;
  getSendingLimit(credentials: Credentials): Promise<{ daily: number | null }>;
  /** Provider-side delivery status for a previously sent message, when available. */
  getDeliveryStatus(
    credentials: Credentials,
    messageId: string,
  ): Promise<{ known: boolean; status: string | null; detail: string }>;
  /** Internal provisioning — never surfaced to customers. */
  registerDomain(credentials: Credentials, domain: string): Promise<DomainRegistration>;
  verifyDomain(credentials: Credentials, domain: string): Promise<DomainRegistration>;
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
        rfcMessageId: result.rfcMessageId,
        requestId: result.requestId,
        statusCode: result.statusCode,
        providerResponse: result.providerResponse,
      };
    },
    async getSendingLimit() {
      return { daily: null };
    },
    async validateSender(credentials, fromEmail) {
      const { checkSenderDomainVerification, senderDomain } = await import(
        "@/lib/managed-sending.server"
      );
      const check = await checkSenderDomainVerification(id, credentials, senderDomain(fromEmail));
      return { ok: check.status !== "not_verified", detail: check.detail };
    },
    async getDeliveryStatus() {
      // Delivery state is tracked from provider webhooks in `email_events`;
      // adapters that expose a polling API can override this.
      return { known: false, status: null, detail: "Delivery status is tracked from webhooks." };
    },
    async registerDomain(_credentials, domain) {
      return {
        supported: false,
        status: "unsupported" as const,
        detail: `${id} domain provisioning is managed outside the app for ${domain}.`,
      };
    },
    async verifyDomain(credentials, domain) {
      const { checkSenderDomainVerification } = await import("@/lib/managed-sending.server");
      const check = await checkSenderDomainVerification(id, credentials, domain, { fresh: true });
      return {
        supported: check.status !== "unknown",
        status:
          check.status === "verified" ? "verified" : check.status === "error" ? "error" : "pending",
        detail: check.detail,
      };
    },
    processWebhook: normalizeEvent,
  };

}

const adapters = new Map<string, ProviderAdapter>(
  ["ses", "resend", "emailit", "mailgun", "postmark", "brevo", "zeptomail", "sendgrid", "smtp", "nuntly", "elasticemail", "maileroo", "courier", "uspeedo"].map(
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
