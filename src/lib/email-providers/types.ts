/**
 * Unified email-provider foundation — client-safe types.
 *
 * MunchReach is provider-independent: nothing above this boundary may know
 * which concrete provider (Resend, SES, Mailgun, Brevo, SendGrid, Postmark,
 * SMTP, ...) handles a message. This file defines the *only* vocabulary the
 * application is allowed to use when talking about provider behaviour.
 *
 * Phase 1 note: these types describe the target boundary. Existing
 * `src/lib/providers/*` and `src/lib/domain-providers/*` abstractions remain in
 * place and are progressively absorbed by this layer; their types are reused
 * here rather than duplicated.
 */

import type {
  DomainStage,
  ProviderDnsRecord,
  ProviderDomainState,
  ProviderRecordKind,
} from "@/lib/domain-providers/types";

export type { DomainStage, ProviderDnsRecord, ProviderDomainState, ProviderRecordKind };

/* ------------------------------------------------------------------ *
 * Capability model
 * ------------------------------------------------------------------ */

export const EMAIL_PROVIDER_CAPABILITIES = [
  "sending",
  "inbound",
  "delivery_tracking",
  "open_tracking",
  "click_tracking",
  "bounce_tracking",
  "webhooks",
  "domain_api",
  "dns_api",
] as const;

export type EmailProviderCapability = (typeof EMAIL_PROVIDER_CAPABILITIES)[number];

/** Every capability is explicitly declared; unsupported features are `false`. */
export type EmailProviderCapabilities = Record<EmailProviderCapability, boolean>;

export function capabilities(
  overrides: Partial<EmailProviderCapabilities> = {},
): EmailProviderCapabilities {
  const base = Object.fromEntries(
    EMAIL_PROVIDER_CAPABILITIES.map((key) => [key, false]),
  ) as EmailProviderCapabilities;
  return { ...base, ...overrides };
}

/* ------------------------------------------------------------------ *
 * Normalized event vocabulary (application level only — no DB change)
 * ------------------------------------------------------------------ */

export const NORMALIZED_EMAIL_EVENT_TYPES = [
  "SENT",
  "ACCEPTED",
  "DELIVERED",
  "DELAYED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "FAILED",
  "COMPLAINED",
  "UNSUBSCRIBED",
  "REPLIED",
] as const;

export type NormalizedEmailEventType = (typeof NORMALIZED_EMAIL_EVENT_TYPES)[number];

/** A provider event normalized into MunchReach's own vocabulary. */
export type NormalizedEmailEvent = {
  type: NormalizedEmailEventType | "UNKNOWN";
  provider: string;
  /** Provider's own id for the event, when it exposes one (dedupe key). */
  providerEventId?: string | null;
  /** Provider's id for the message the event belongs to. */
  providerMessageId?: string | null;
  /** RFC 5322 Message-ID, when the provider exposes it. */
  rfcMessageId?: string | null;
  recipient?: string | null;
  sender?: string | null;
  subject?: string | null;
  /** Click target for CLICKED events. */
  url?: string | null;
  /** Bounce/failure classification, when known. */
  bounceType?: "hard" | "soft" | "block" | "unknown" | null;
  reason?: string | null;
  occurredAt?: string | null;
  rawMetadata?: unknown;
};

/** A parsed inbound (received/reply) message. */
export type InboundEmailEvent = {
  provider: string;
  providerEventId?: string | null;
  providerMessageId?: string | null;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  /** RFC 5322 Message-ID of the inbound message. */
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  receivedAt?: string | null;
  attachments?: InboundEmailAttachment[];
  rawMetadata?: unknown;
};

export type InboundEmailAttachment = {
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
  /** Base64 content or a provider URL — whichever the provider supplies. */
  content?: string | null;
  url?: string | null;
};

/* ------------------------------------------------------------------ *
 * Sending / status
 * ------------------------------------------------------------------ */

export type EmailProviderCredentials = Record<string, string>;

export type UnifiedOutboundMessage = {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: { name: string; url?: string; content?: string }[];
};

export type UnifiedSendResult = {
  ok: boolean;
  /** Provider-side message id, used to correlate later webhook events. */
  providerMessageId?: string | null;
  rfcMessageId?: string | null;
  statusCode?: number | null;
  message: string;
  rawMetadata?: unknown;
};

export type UnifiedSendStatus = {
  known: boolean;
  status: NormalizedEmailEventType | "UNKNOWN" | null;
  detail: string;
};

export type UnifiedDomainStatus = ProviderDomainState & {
  providerDomainId?: string | null;
  /** True only when the provider says the domain may send. */
  readyToSend: boolean;
};

export type UnifiedInboundStatus = {
  enabled: boolean;
  /** Records required for inbound receiving (usually MX). */
  records: ProviderDnsRecord[];
  detail: string;
};

export type UnifiedWebhookConfig = {
  configured: boolean;
  url?: string | null;
  events?: string[];
  detail: string;
};

export type WebhookVerification = {
  valid: boolean;
  detail: string;
  /** Provider-native verdict, preserved for admin status reporting. */
  verification?: { status: string; method: string; reason: string };
};

/** Result of asking each provider "is this HTTP request yours?". */
export type WebhookIdentification = {
  provider: string;
  matched: boolean;
  confidence: "exact" | "likely" | "none";
  detail: string;
};

export type WebhookRequestContext = {
  headers: Record<string, string>;
  /** Raw, unparsed body — signature verification must use this exact string. */
  rawBody: string;
  url?: string | null;
  /** Query params, used by providers that authenticate with a shared token. */
  query?: Record<string, string>;
  /** Parsed body, when the caller already parsed it (never used for signatures). */
  payload?: unknown;
  /**
   * The original Request. Signature verification must use this together with
   * `rawBody` so provider secret lookup keyed on the endpoint URL keeps working.
   */
  request?: Request;
};

