/**
 * The single entry point for provider adapters.
 *
 * Server-only (adapters reach provider APIs). Client code must import types
 * from `./types` instead.
 */
import { birdEmailProvider } from "./bird.server";
import { courierEmailProvider } from "./courier.server";
import { elasticEmailProvider } from "./elasticemail.server";
import { mailerooEmailProvider } from "./maileroo.server";
import { nuntlyEmailProvider } from "./nuntly.server";
import { uspeedoEmailProvider } from "./uspeedo.server";
import type { EmailProvider } from "./provider";
import { resendEmailProvider } from "./resend.server";
import { sesEmailProvider } from "./ses.server";
import { capabilities } from "./types";

const registry = new Map<string, EmailProvider>([
  [resendEmailProvider.id, resendEmailProvider],
  [sesEmailProvider.id, sesEmailProvider],
  [birdEmailProvider.id, birdEmailProvider],
  [nuntlyEmailProvider.id, nuntlyEmailProvider],
  [elasticEmailProvider.id, elasticEmailProvider],
  [mailerooEmailProvider.id, mailerooEmailProvider],
  [courierEmailProvider.id, courierEmailProvider],
  [uspeedoEmailProvider.id, uspeedoEmailProvider],
]);

/** Placeholder for providers not yet migrated into this layer. */
function unregisteredProvider(id: string): EmailProvider {
  return { id, label: id, capabilities: capabilities(), inboundSetupMode: "unsupported" };
}

export function getEmailProvider(providerId: string): EmailProvider {
  return registry.get(providerId) ?? unregisteredProvider(providerId);
}

export function isEmailProviderRegistered(providerId: string): boolean {
  return registry.has(providerId);
}

export function listEmailProviders(): EmailProvider[] {
  return [...registry.values()];
}

/** Asks every registered provider whether an incoming webhook belongs to it. */
export function identifyWebhookProvider(
  request: Parameters<NonNullable<EmailProvider["identifyWebhookRequest"]>>[0],
): EmailProvider | null {
  for (const provider of registry.values()) {
    const result = provider.identifyWebhookRequest?.(request);
    if (result?.matched) return provider;
  }
  return null;
}
