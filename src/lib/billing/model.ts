/**
 * Shared billing types and helpers. Client-safe: no secrets, no server imports.
 */

export const BILLING_PROVIDERS = ["stripe", "paddle", "lemonsqueezy"] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

export const BILLING_ENVIRONMENTS = ["test", "live"] as const;
export type BillingEnvironment = (typeof BILLING_ENVIRONMENTS)[number];

export type BillingInterval = "monthly" | "yearly";

export const SUBSCRIPTION_STATES = [
  "trialing",
  "active",
  "past_due",
  "payment_failed",
  "paused",
  "cancelled",
  "expired",
] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export const PROVIDER_LABELS: Record<BillingProvider, string> = {
  stripe: "Stripe",
  paddle: "Paddle",
  lemonsqueezy: "Lemon Squeezy",
};

export const STATE_LABELS: Record<SubscriptionState, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  payment_failed: "Payment failed",
  paused: "Paused",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** States that still grant paid feature access. */
export const ENTITLED_STATES: SubscriptionState[] = ["trialing", "active", "past_due"];

/** Credentials each provider requires, surfaced in the admin setup checklist. */
export const PROVIDER_REQUIREMENTS: Record<
  BillingProvider,
  { secrets: { name: string; label: string }[]; ids: string; webhookPath: string; notes: string[] }
> = {
  stripe: {
    secrets: [
      { name: "STRIPE_SECRET_KEY", label: "Secret API key (sk_test_… / sk_live_…)" },
      { name: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret (whsec_…)" },
    ],
    ids: "Price IDs (price_…) for each plan and billing cycle",
    webhookPath: "/api/public/billing/stripe",
    notes: [
      "Subscribe the endpoint to checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed and charge.refunded.",
      "Enable the Customer Portal in Stripe so members can manage payment methods.",
    ],
  },
  paddle: {
    secrets: [
      { name: "PADDLE_API_KEY", label: "API key (Paddle Billing)" },
      { name: "PADDLE_WEBHOOK_SECRET", label: "Notification destination secret key" },
    ],
    ids: "Price IDs (pri_…) for each plan and billing cycle",
    webhookPath: "/api/public/billing/paddle",
    notes: [
      "Create a notification destination pointing at the webhook URL.",
      "Subscribe to subscription.*, transaction.completed, transaction.payment_failed and adjustment.updated.",
    ],
  },
  lemonsqueezy: {
    secrets: [
      { name: "LEMONSQUEEZY_API_KEY", label: "API key" },
      { name: "LEMONSQUEEZY_WEBHOOK_SECRET", label: "Webhook signing secret" },
      { name: "LEMONSQUEEZY_STORE_ID", label: "Store ID" },
    ],
    ids: "Variant IDs for each plan and billing cycle",
    webhookPath: "/api/public/billing/lemonsqueezy",
    notes: [
      "Test mode uses the same endpoint; the payload's test_mode flag routes it to the test environment.",
      "Subscribe to subscription_created, subscription_updated, subscription_payment_success, subscription_payment_failed and order_refunded.",
    ],
  },
};

/** Suffix used for the per-environment secret names, e.g. STRIPE_SECRET_KEY_TEST. */
export function secretName(base: string, environment: BillingEnvironment) {
  return `${base}_${environment.toUpperCase()}`;
}

export function formatMoney(cents: number, currency = "usd") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/* --------------------------------------------------- setup & test tracking */

/** Shape each provider's external plan identifier must take. */
export const PROVIDER_ID_RULES: Record<
  BillingProvider,
  { label: string; hint: string; test: (value: string) => boolean }
> = {
  stripe: {
    label: "Price ID",
    hint: "Starts with price_ (e.g. price_1P2x…)",
    test: (v) => /^price_[A-Za-z0-9]+$/.test(v.trim()),
  },
  paddle: {
    label: "Price ID",
    hint: "Starts with pri_ (e.g. pri_01hq…)",
    test: (v) => /^pri_[A-Za-z0-9]+$/.test(v.trim()),
  },
  lemonsqueezy: {
    label: "Variant ID",
    hint: "Numeric variant ID (e.g. 483920)",
    test: (v) => /^\d{3,12}$/.test(v.trim()),
  },
};

/** Webhook events each provider must deliver before the setup is trusted. */
export const PROVIDER_TEST_EVENTS: Record<BillingProvider, { type: string; label: string }[]> = {
  stripe: [
    { type: "checkout.session.completed", label: "Checkout completed" },
    { type: "customer.subscription.created", label: "Subscription created" },
    { type: "customer.subscription.updated", label: "Subscription updated" },
    { type: "customer.subscription.deleted", label: "Subscription cancelled" },
    { type: "invoice.paid", label: "Invoice paid" },
    { type: "invoice.payment_failed", label: "Payment failed" },
    { type: "charge.refunded", label: "Refund issued" },
  ],
  paddle: [
    { type: "subscription.created", label: "Subscription created" },
    { type: "subscription.updated", label: "Subscription updated" },
    { type: "subscription.canceled", label: "Subscription cancelled" },
    { type: "transaction.completed", label: "Payment completed" },
    { type: "transaction.payment_failed", label: "Payment failed" },
    { type: "adjustment.updated", label: "Refund / adjustment" },
  ],
  lemonsqueezy: [
    { type: "subscription_created", label: "Subscription created" },
    { type: "subscription_updated", label: "Subscription updated" },
    { type: "subscription_cancelled", label: "Subscription cancelled" },
    { type: "subscription_payment_success", label: "Payment succeeded" },
    { type: "subscription_payment_failed", label: "Payment failed" },
    { type: "order_refunded", label: "Refund issued" },
  ],
};

/** End-to-end flows verified from stored billing records rather than events. */
export const BILLING_TEST_FLOWS = [
  { key: "checkout", label: "Customer completed checkout", detail: "A subscription record exists for this provider and mode." },
  { key: "active", label: "Subscription became active", detail: "At least one subscription reached trialing or active." },
  { key: "payment", label: "Payment recorded", detail: "A successful payment transaction was stored." },
  { key: "invoice", label: "Invoice stored", detail: "An invoice was received and saved." },
  { key: "failed", label: "Failed payment handled", detail: "A payment failure was processed without errors." },
  { key: "refund", label: "Refund handled", detail: "A refund transaction was stored." },
  { key: "cancel", label: "Cancellation handled", detail: "A subscription was cancelled or expired." },
] as const;
export type BillingTestFlowKey = (typeof BILLING_TEST_FLOWS)[number]["key"];
