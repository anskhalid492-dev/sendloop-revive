/**
 * The single provider interface for MunchReach email infrastructure.
 *
 * Every method except `id`/`capabilities` is optional: providers declare what
 * they support through the capability model instead of throwing for features
 * they lack. Callers must check `capabilities` (or use the `supports()` helper)
 * before relying on an optional method.
 */
import type { InboundSetupMode } from "./inbound";
import type {
  EmailProviderCapabilities,
  EmailProviderCapability,
  EmailProviderCredentials,
  InboundEmailEvent,
  InboundMessageContent,
  NormalizedEmailEvent,
  ProviderDnsRecord,
  UnifiedDomainStatus,
  UnifiedDomainSummary,
  UnifiedWebhookEntry,
  UnifiedInboundStatus,
  UnifiedOutboundMessage,
  UnifiedSendResult,
  UnifiedSendStatus,
  UnifiedWebhookConfig,
  WebhookIdentification,
  WebhookRequestContext,
  WebhookVerification,
} from "./types";

export type EmailProvider = {
  /** Internal provider id (never shown to customers). */
  id: string;
  /** Internal admin-facing label (never shown to customers). */
  label: string;
  capabilities: EmailProviderCapabilities;
  /**
   * How receiving is turned on for this provider. Declared explicitly so the
   * generic domain layer never assumes every provider behaves the same way.
   */
  inboundSetupMode: InboundSetupMode;

  /* sending */
  send?(
    creds: EmailProviderCredentials,
    message: UnifiedOutboundMessage,
  ): Promise<UnifiedSendResult>;
  getSendStatus?(
    creds: EmailProviderCredentials,
    providerMessageId: string,
  ): Promise<UnifiedSendStatus>;
  /** RFC 5322 Message-ID for a previously sent message, when retrievable. */
  getRfcMessageId?(
    creds: EmailProviderCredentials,
    providerMessageId: string,
  ): Promise<string | null>;

  /* domains + dns */
  verifyDomain?(creds: EmailProviderCredentials, domain: string): Promise<UnifiedDomainStatus>;
  getDomainStatus?(creds: EmailProviderCredentials, domain: string): Promise<UnifiedDomainStatus>;
  getDnsRequirements?(
    creds: EmailProviderCredentials,
    domain: string,
  ): Promise<ProviderDnsRecord[]>;

  /* inbound */
  enableInbound?(creds: EmailProviderCredentials, domain: string): Promise<UnifiedInboundStatus>;
  getInboundStatus?(creds: EmailProviderCredentials, domain: string): Promise<UnifiedInboundStatus>;

  /* webhooks */
  configureWebhooks?(
    creds: EmailProviderCredentials,
    url: string,
    events?: string[],
  ): Promise<UnifiedWebhookConfig>;
  verifyWebhookSignature?(
    request: WebhookRequestContext,
    secret: string | null,
  ): Promise<WebhookVerification> | WebhookVerification;
  identifyWebhookRequest?(request: WebhookRequestContext): WebhookIdentification;
  /* admin inventory (internal only — never customer-facing) */
  listDomains?(creds: EmailProviderCredentials): Promise<UnifiedDomainSummary[]>;
  listWebhooks?(creds: EmailProviderCredentials): Promise<UnifiedWebhookEntry[]>;
  registerWebhook?(
    creds: EmailProviderCredentials,
    endpoint: string,
    events: string[],
  ): Promise<{ ok: boolean; id: string | null; detail: string }>;
  deleteWebhook?(
    creds: EmailProviderCredentials,
    id: string,
  ): Promise<{ ok: boolean; detail: string }>;

  /* event normalization */
  parseInboundEvent?(payload: unknown): InboundEmailEvent | null;
  parseDeliveryEvent?(payload: unknown): NormalizedEmailEvent | null;
  parseTrackingEvent?(payload: unknown): NormalizedEmailEvent | null;

  /**
   * Reshapes a provider-specific webhook envelope into the flat email payload
   * the shared inbound processor reads. Providers that already deliver that
   * shape omit this and nothing changes for them.
   */
  normalizeWebhookPayload?(payload: Record<string, unknown>): Record<string, unknown> | null;
  /**
   * Provider handshake performed after signature verification (for example a
   * topic subscription confirmation). Returning a result ends the delivery.
   */
  handleWebhookHandshake?(
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown } | null>;

  /* inbound content retrieval */
  getInboundMessageContent?(
    creds: EmailProviderCredentials,
    providerMessageId: string,
  ): Promise<InboundMessageContent | null>;
};

export function supports(
  provider: EmailProvider,
  capability: EmailProviderCapability,
): boolean {
  return provider.capabilities[capability] === true;
}
