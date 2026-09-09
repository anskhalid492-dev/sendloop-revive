/** Maps an internal provider id to its domain adapter. */
import {
  unsupportedDomainAdapter,
  type DomainProviderAdapter,
  type ProviderOutboundMessage,
} from "./adapter.server";
import { brevoDomainAdapter } from "./brevo.server";
import { elasticEmailDomainAdapter } from "./elasticemail.server";
import { mailerooDomainAdapter } from "./maileroo.server";
import { nuntlyDomainAdapter } from "./nuntly.server";
import { mailgunDomainAdapter } from "./mailgun.server";
import { resendDomainAdapter } from "./resend.server";
import { sendgridDomainAdapter } from "./sendgrid.server";
import { sesDomainAdapter } from "./ses.server";

const baseAdapters: Record<string, DomainProviderAdapter> = {
  ses: sesDomainAdapter,
  mailgun: mailgunDomainAdapter,
  brevo: brevoDomainAdapter,
  resend: resendDomainAdapter,
  sendgrid: sendgridDomainAdapter,
  nuntly: nuntlyDomainAdapter,
  elasticemail: elasticEmailDomainAdapter,
  maileroo: mailerooDomainAdapter,
};

/**
 * Every adapter also exposes sendEmail()/getDeliveryStatus(). Those delegate to
 * the provider-specific sending layer, so provider API detail never leaks above
 * the adapter boundary.
 */
function withSending(id: string, adapter: DomainProviderAdapter): DomainProviderAdapter {
  return {
    ...adapter,
    async sendEmail(creds, message: ProviderOutboundMessage) {
      const { sendProviderEmail } = await import("@/lib/provider-credentials.server");
      const result = await sendProviderEmail(id, creds, {
        ...message,
        replyTo: message.replyTo ?? null,
      });
      return { ok: result.ok, messageId: result.messageId, message: result.message };
    },
    async getDeliveryStatus(creds, messageId) {
      const { getAdapter } = await import("@/lib/providers/adapter.server");
      return getAdapter(id).getDeliveryStatus(creds, messageId);
    },
  };
}

const adapters: Record<string, DomainProviderAdapter> = Object.fromEntries(
  Object.entries(baseAdapters).map(([id, adapter]) => [id, withSending(id, adapter)]),
);

export function getDomainAdapter(provider: string): DomainProviderAdapter {
  return adapters[provider] ?? unsupportedDomainAdapter(provider);
}

export const DOMAIN_CAPABLE_PROVIDERS = Object.keys(adapters);
