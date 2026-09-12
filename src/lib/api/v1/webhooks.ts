/**
 * Webhook contract shared by the delivery worker, the API and the docs page.
 *
 * Client-safe: no secrets, no database access. Signature construction lives
 * here so the documented recipe and the code that signs a payload cannot drift.
 */

export const WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.failed",
  "email.unsubscribed",
  "reply.received",
  "campaign.launched",
  "campaign.completed",
  "campaign.paused",
  "contact.created",
  "contact.updated",
  "contact.replied",
  "lead.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEvent, string> = {
  "email.sent": "A campaign email was accepted by the sending provider.",
  "email.delivered": "The provider confirmed delivery to the recipient's server.",
  "email.opened": "A tracked open was recorded.",
  "email.clicked": "A tracked link was clicked.",
  "email.bounced": "The message bounced.",
  "email.failed": "The message could not be sent after all retries.",
  "email.unsubscribed": "The recipient used the unsubscribe link.",
  "reply.received": "An inbound reply was threaded into the unified inbox.",
  "campaign.launched": "A campaign moved from draft to active.",
  "campaign.completed": "A campaign finished its sequence for every recipient.",
  "campaign.paused": "A campaign was paused.",
  "contact.created": "A contact was created.",
  "contact.updated": "A contact was updated.",
  "contact.replied": "A contact replied for the first time.",
  "lead.created": "A lead was added to the workspace (CRM, import, API or integration).",
};

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/**
 * The exact string that gets signed: `v1:<timestamp>:<raw body>`.
 * Including the timestamp is what makes replay detection possible.
 */
export function signaturePayload(timestamp: number, body: string): string {
  return `v1:${timestamp}:${body}`;
}

export const SIGNATURE_HEADER = "x-munchreach-signature";
export const TIMESTAMP_HEADER = "x-munchreach-timestamp";
export const EVENT_HEADER = "x-munchreach-event";
export const DELIVERY_HEADER = "x-munchreach-delivery";

/** Retry schedule in seconds, applied per attempt (exponential with a ceiling). */
export const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600, 21600, 86400];

export function nextAttemptDelaySeconds(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_BACKOFF_SECONDS.length - 1);
  return RETRY_BACKOFF_SECONDS[index]!;
}
