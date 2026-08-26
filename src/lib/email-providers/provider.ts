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
  NormalizedEmailEvent,
  ProviderDnsRecord,
  UnifiedDomainStatus,
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

  /* event normalization */
  parseInboundEvent?(payload: unknown): InboundEmailEvent | null;
  parseDeliveryEvent?(payload: unknown): NormalizedEmailEvent | null;
  parseTrackingEvent?(payload: unknown): NormalizedEmailEvent | null;
};

export function supports(
  provider: EmailProvider,
  capability: EmailProviderCapability,
): boolean {
  return provider.capabilities[capability] === true;
}
