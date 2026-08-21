/** Maps an internal provider id to its domain adapter. */
import { unsupportedDomainAdapter, type DomainProviderAdapter } from "./adapter.server";
import { brevoDomainAdapter } from "./brevo.server";
import { mailgunDomainAdapter } from "./mailgun.server";
import { resendDomainAdapter } from "./resend.server";
import { sendgridDomainAdapter } from "./sendgrid.server";
import { sesDomainAdapter } from "./ses.server";

const adapters: Record<string, DomainProviderAdapter> = {
  ses: sesDomainAdapter,
  mailgun: mailgunDomainAdapter,
  brevo: brevoDomainAdapter,
  resend: resendDomainAdapter,
  sendgrid: sendgridDomainAdapter,
};

export function getDomainAdapter(provider: string): DomainProviderAdapter {
  return adapters[provider] ?? unsupportedDomainAdapter(provider);
}

export const DOMAIN_CAPABLE_PROVIDERS = Object.keys(adapters);
