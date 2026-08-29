/**
 * Event vocabulary for the Marketing Engine.
 *
 * Two distinct families live here and they must never be merged:
 *
 * 1. PRODUCT events — already emitted by MunchReach's product surfaces
 *    (signup, mailbox connect, campaign lifecycle, billing). The Marketing
 *    Engine only CONSUMES these; it never defines, stores or re-emits them.
 * 2. MARKETING events — delivery outcomes for marketing email only. These are
 *    recorded in `marketing_email_events` and are deliberately separate from
 *    the cold-email `email_events` table so outbound analytics stay clean.
 */

/** Product/user events the Marketing Engine can be triggered by. */
export const PRODUCT_EVENTS = [
  "user_signed_up",
  "user_verified_email",
  "mailbox_connected",
  "campaign_created",
  "campaign_launched",
  "campaign_completed",
  "first_email_sent",
  "first_reply_received",
  "campaign_inactive",
  "feature_used",
  "subscription_started",
  "subscription_cancelled",
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

const PRODUCT_EVENT_LABELS: Record<ProductEvent, string> = {
  user_signed_up: "User signed up",
  user_verified_email: "User verified email",
  mailbox_connected: "Mailbox connected",
  campaign_created: "Campaign created",
  campaign_launched: "Campaign launched",
  campaign_completed: "Campaign completed",
  first_email_sent: "First email sent",
  first_reply_received: "First reply received",
  campaign_inactive: "Campaign inactive",
  feature_used: "Feature used",
  subscription_started: "Subscription started",
  subscription_cancelled: "Subscription cancelled",
};

export function isProductEvent(value: string): value is ProductEvent {
  return (PRODUCT_EVENTS as readonly string[]).includes(value);
}

export function productEventLabel(value: string): string {
  return isProductEvent(value) ? PRODUCT_EVENT_LABELS[value] : value;
}

/** Marketing-only delivery events. Never mixed with product events. */
export const MARKETING_EVENTS = [
  "marketing_email_sent",
  "marketing_email_delivered",
  "marketing_email_opened",
  "marketing_email_clicked",
  "marketing_email_bounced",
  "marketing_email_complained",
  "marketing_email_unsubscribed",
  "marketing_email_failed",
  "marketing_email_suppressed",
] as const;

export type MarketingEvent = (typeof MARKETING_EVENTS)[number];

export function isMarketingEvent(value: string): value is MarketingEvent {
  return (MARKETING_EVENTS as readonly string[]).includes(value);
}

/**
 * Guard used by the automation editor and the API layer: a marketing
 * automation may only be triggered by an existing product event, never by a
 * marketing delivery event (that would create feedback loops) and never by an
 * invented event name (that would duplicate the product event system).
 */
export function assertTriggerEvent(value: string): ProductEvent {
  if (!isProductEvent(value)) {
    throw new Error(`Unknown trigger event: ${value}`);
  }
  return value;
}
