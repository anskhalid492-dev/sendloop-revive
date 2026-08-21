/**
 * Provider adapters — server only.
 *
 * Every provider (Stripe, Paddle, Lemon Squeezy) is reduced to the same small
 * interface so the rest of MunchReach never branches on provider. Raw provider
 * errors stay here and in the billing logs; callers get sanitized messages.
 */
import type {
  BillingEnvironment,
  BillingInterval,
  BillingProvider,
  SubscriptionState,
} from "@/lib/billing/model";
import { providerCredentials, type NormalizedBillingEvent } from "@/lib/billing/core.server";

export class BillingError extends Error {
  readonly detail: string;
  constructor(detail: string, message = "Payment could not be completed. Please try again.") {
    super(message);
    this.detail = detail;
  }
}

export type CheckoutInput = {
  environment: BillingEnvironment;
  priceId: string;
  workspaceId: string;
  planId: string;
  interval: BillingInterval;
  email: string | null;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type VerifiedWebhook = {
  ok: boolean;
  environment: BillingEnvironment;
  eventId: string;
  eventType: string;
  payload: any;
  error?: string;
};

export type ProviderAdapter = {
  id: BillingProvider;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  cancel(env: BillingEnvironment, subscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  resume(env: BillingEnvironment, subscriptionId: string): Promise<void>;
  changePlan(env: BillingEnvironment, subscriptionId: string, priceId: string): Promise<void>;
  portalUrl(
    env: BillingEnvironment,
    args: { customerId: string | null; subscriptionId: string | null; returnUrl: string },
  ): Promise<string | null>;
  verify(env: BillingEnvironment, rawBody: string, headers: Headers): Promise<VerifiedWebhook>;
  normalize(event: VerifiedWebhook): NormalizedBillingEvent | null;
};

/* ------------------------------------------------------------ crypto utils */

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function iso(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function credentialsOrThrow(provider: BillingProvider, env: BillingEnvironment) {
  const c = await providerCredentials(provider, env);
  if (!c.apiKey) throw new BillingError(`${provider} ${env} API key is not configured`);
  return c;
}

/* ----------------------------------------------------------------- Stripe */

function formEncode(obj: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") parts.push(...formEncode(value as Record<string, unknown>, name));
    else parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts;
}

async function stripeCall(
  env: BillingEnvironment,
  path: string,
  body?: Record<string, unknown>,
  method = "POST",
) {
  const { apiKey } = await credentialsOrThrow("stripe", env);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body: formEncode(body).join("&") } : {}),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new BillingError(json?.error?.message ?? `Stripe ${res.status}`);
  return json;
}

const STRIPE_STATUS: Record<string, SubscriptionState> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "payment_failed",
  incomplete: "payment_failed",
  incomplete_expired: "expired",
  paused: "paused",
  canceled: "cancelled",
};

const stripe: ProviderAdapter = {
  id: "stripe",
  async createCheckout(input) {
    const session = await stripeCall(input.environment, "checkout/sessions", {
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.workspaceId,
      allow_promotion_codes: "true",
      ...(input.customerId ? { customer: input.customerId } : {}),
      ...(!input.customerId && input.email ? { customer_email: input.email } : {}),
      line_items: { 0: { price: input.priceId, quantity: 1 } },
      metadata: { workspace_id: input.workspaceId, plan_id: input.planId },
      subscription_data: {
        metadata: { workspace_id: input.workspaceId, plan_id: input.planId },
      },
    });
    return { url: session.url as string };
  },
  async cancel(env, subscriptionId, atPeriodEnd) {
    if (atPeriodEnd)
      await stripeCall(env, `subscriptions/${subscriptionId}`, { cancel_at_period_end: "true" });
    else await stripeCall(env, `subscriptions/${subscriptionId}`, undefined, "DELETE");
  },
  async resume(env, subscriptionId) {
    await stripeCall(env, `subscriptions/${subscriptionId}`, { cancel_at_period_end: "false" });
  },
  async changePlan(env, subscriptionId, priceId) {
    const sub = await stripeCall(env, `subscriptions/${subscriptionId}`, undefined, "GET");
    const itemId = sub?.items?.data?.[0]?.id;
    if (!itemId) throw new BillingError("Stripe subscription has no items");
    await stripeCall(env, `subscriptions/${subscriptionId}`, {
      proration_behavior: "create_prorations",
      items: { 0: { id: itemId, price: priceId } },
    });
  },
  async portalUrl(env, { customerId, returnUrl }) {
    if (!customerId) return null;
    const session = await stripeCall(env, "billing_portal/sessions", {
      customer: customerId,
      return_url: returnUrl,
    });
    return (session.url as string) ?? null;
  },
  async verify(env, rawBody, headers) {
    const { webhookSecret } = await providerCredentials("stripe", env);
    const header = headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k?.trim() ?? "", v ?? ""];
      }),
    );
    const base = { environment: env, eventId: "", eventType: "", payload: null as any };
    if (!webhookSecret) return { ...base, ok: false, error: "Webhook secret not configured" };
    if (!parts["t"] || !parts["v1"]) return { ...base, ok: false, error: "Missing signature" };
    const expected = await hmacHex(webhookSecret, `${parts["t"]}.${rawBody}`);
    if (!safeEqual(expected, parts["v1"] as string))
      return { ...base, ok: false, error: "Signature mismatch" };
    const payload = JSON.parse(rawBody);
    return {
      ok: true,
      environment: payload.livemode ? "live" : "test",
      eventId: payload.id,
      eventType: payload.type,
      payload,
    };
  },
  normalize(event) {
    const p = event.payload;
    const obj = p?.data?.object ?? {};
    const base = {
      eventId: event.eventId,
      eventType: event.eventType,
      environment: event.environment,
    };

    if (event.eventType.startsWith("customer.subscription.")) {
      const item = obj.items?.data?.[0];
      const status: SubscriptionState =
        event.eventType === "customer.subscription.deleted"
          ? "cancelled"
          : (STRIPE_STATUS[obj.status] ?? "active");
      return {
        ...base,
        workspaceId: obj.metadata?.workspace_id ?? null,
        subscription: {
          externalId: obj.id,
          customerId: obj.customer ?? null,
          status,
          interval: item?.price?.recurring?.interval === "year" ? "yearly" : "monthly",
          amountCents: item?.price?.unit_amount ?? 0,
          currency: obj.currency ?? item?.price?.currency ?? "usd",
          currentPeriodStart: iso(obj.current_period_start),
          currentPeriodEnd: iso(obj.current_period_end),
          trialEndsAt: iso(obj.trial_end),
          cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
          cancelledAt: iso(obj.canceled_at),
          priceId: item?.price?.id ?? null,
        },
      };
    }

    if (event.eventType === "invoice.paid" || event.eventType === "invoice.payment_failed") {
      const paid = event.eventType === "invoice.paid";
      return {
        ...base,
        invoice: {
          externalId: obj.id,
          number: obj.number ?? null,
          amountCents: obj.amount_due ?? obj.total ?? 0,
          currency: obj.currency ?? "usd",
          status: paid ? "paid" : "uncollectible",
          hostedUrl: obj.hosted_invoice_url ?? null,
          pdfUrl: obj.invoice_pdf ?? null,
          issuedAt: iso(obj.created),
        },
        transaction: {
          externalId: obj.payment_intent ?? obj.id,
          kind: "payment",
          amountCents: paid ? (obj.amount_paid ?? 0) : (obj.amount_due ?? 0),
          currency: obj.currency ?? "usd",
          status: paid ? "succeeded" : "failed",
          description: obj.number ? `Invoice ${obj.number}` : null,
          occurredAt: iso(obj.created),
        },
      };
    }

    if (event.eventType === "charge.refunded") {
      return {
        ...base,
        transaction: {
          externalId: obj.id,
          kind: "refund",
          amountCents: obj.amount_refunded ?? 0,
          currency: obj.currency ?? "usd",
          status: "refunded",
          description: "Refund",
          occurredAt: iso(obj.created),
        },
      };
    }

    return null;
  },
};

/* ----------------------------------------------------------------- Paddle */

function paddleBase(env: BillingEnvironment) {
  return env === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

async function paddleCall(
  env: BillingEnvironment,
  path: string,
  body?: unknown,
  method = "POST",
) {
  const { apiKey } = await credentialsOrThrow("paddle", env);
  const res = await fetch(`${paddleBase(env)}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new BillingError(json?.error?.detail ?? `Paddle ${res.status}`);
  return json;
}

const PADDLE_STATUS: Record<string, SubscriptionState> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  paused: "paused",
  canceled: "cancelled",
};

const paddle: ProviderAdapter = {
  id: "paddle",
  async createCheckout(input) {
    // Paddle Billing checkouts are created as a transaction, then opened via
    // the returned hosted checkout URL.
    const tx = await paddleCall(input.environment, "transactions", {
      items: [{ price_id: input.priceId, quantity: 1 }],
      custom_data: { workspace_id: input.workspaceId, plan_id: input.planId },
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      checkout: { url: input.successUrl },
    });
    const url = tx?.data?.checkout?.url;
    if (!url) throw new BillingError("Paddle did not return a checkout URL");
    return { url };
  },
  async cancel(env, subscriptionId, atPeriodEnd) {
    await paddleCall(env, `subscriptions/${subscriptionId}/cancel`, {
      effective_from: atPeriodEnd ? "next_billing_period" : "immediately",
    });
  },
  async resume(env, subscriptionId) {
    await paddleCall(env, `subscriptions/${subscriptionId}`, { scheduled_change: null }, "PATCH");
  },
  async changePlan(env, subscriptionId, priceId) {
    await paddleCall(
      env,
      `subscriptions/${subscriptionId}`,
      {
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: "prorated_immediately",
      },
      "PATCH",
    );
  },
  async portalUrl(env, { customerId }) {
    if (!customerId) return null;
    const res = await paddleCall(env, `customers/${customerId}/portal-sessions`, {});
    return res?.data?.urls?.general?.overview ?? null;
  },
  async verify(env, rawBody, headers) {
    const { webhookSecret } = await providerCredentials("paddle", env);
    const header = headers.get("paddle-signature") ?? "";
    const parts = Object.fromEntries(
      header.split(";").map((p) => {
        const [k, v] = p.split("=");
        return [k?.trim() ?? "", v ?? ""];
      }),
    );
    const base = { environment: env, eventId: "", eventType: "", payload: null as any };
    if (!webhookSecret) return { ...base, ok: false, error: "Webhook secret not configured" };
    if (!parts["ts"] || !parts["h1"]) return { ...base, ok: false, error: "Missing signature" };
    const expected = await hmacHex(webhookSecret, `${parts["ts"]}:${rawBody}`);
    if (!safeEqual(expected, parts["h1"] as string))
      return { ...base, ok: false, error: "Signature mismatch" };
    const payload = JSON.parse(rawBody);
    return {
      ok: true,
      environment: env,
      eventId: payload.event_id ?? payload.notification_id,
      eventType: payload.event_type,
      payload,
    };
  },
  normalize(event) {
    const d = event.payload?.data ?? {};
    const base = {
      eventId: event.eventId,
      eventType: event.eventType,
      environment: event.environment,
      workspaceId: d.custom_data?.workspace_id ?? null,
    };

    if (event.eventType.startsWith("subscription.")) {
      const item = d.items?.[0];
      const status: SubscriptionState =
        event.eventType === "subscription.canceled"
          ? "cancelled"
          : (PADDLE_STATUS[d.status] ?? "active");
      const interval: BillingInterval =
        d.billing_cycle?.interval === "year" ? "yearly" : "monthly";
      return {
        ...base,
        subscription: {
          externalId: d.id,
          customerId: d.customer_id ?? null,
          status,
          interval,
          amountCents: Number(item?.price?.unit_price?.amount ?? 0),
          currency: d.currency_code ?? "usd",
          currentPeriodStart: d.current_billing_period?.starts_at ?? null,
          currentPeriodEnd: d.current_billing_period?.ends_at ?? null,
          trialEndsAt: d.trial_dates?.ends_at ?? null,
          cancelAtPeriodEnd: d.scheduled_change?.action === "cancel",
          cancelledAt: d.canceled_at ?? null,
          priceId: item?.price?.id ?? null,
        },
      };
    }

    if (event.eventType.startsWith("transaction.")) {
      const total = Number(d.details?.totals?.grand_total ?? 0);
      const failed = event.eventType === "transaction.payment_failed";
      if (event.eventType !== "transaction.completed" && !failed) return null;
      return {
        ...base,
        transaction: {
          externalId: d.id,
          kind: "payment",
          amountCents: total,
          currency: d.currency_code ?? "usd",
          status: failed ? "failed" : "succeeded",
          description: d.origin ?? null,
          occurredAt: d.billed_at ?? event.payload?.occurred_at ?? null,
        },
        ...(d.invoice_id
          ? {
              invoice: {
                externalId: d.invoice_id,
                number: d.invoice_number ?? null,
                amountCents: total,
                currency: d.currency_code ?? "usd",
                status: failed ? "uncollectible" : "paid",
                hostedUrl: null,
                pdfUrl: null,
                issuedAt: d.billed_at ?? null,
              },
            }
          : {}),
      };
    }

    if (event.eventType.startsWith("adjustment.") && d.action === "refund") {
      return {
        ...base,
        transaction: {
          externalId: d.id,
          kind: "refund",
          amountCents: Number(d.totals?.total ?? 0),
          currency: d.currency_code ?? "usd",
          status: "refunded",
          description: d.reason ?? "Refund",
          occurredAt: d.created_at ?? null,
        },
      };
    }

    return null;
  },
};

/* ---------------------------------------------------------- Lemon Squeezy */

async function lemonCall(env: BillingEnvironment, path: string, body?: unknown, method = "POST") {
  const { apiKey } = await credentialsOrThrow("lemonsqueezy", env);
  const res = await fetch(`https://api.lemonsqueezy.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok)
    throw new BillingError(json?.errors?.[0]?.detail ?? `Lemon Squeezy ${res.status}`);
  return json;
}

const LEMON_STATUS: Record<string, SubscriptionState> = {
  on_trial: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "payment_failed",
  paused: "paused",
  cancelled: "cancelled",
  expired: "expired",
};

const lemonsqueezy: ProviderAdapter = {
  id: "lemonsqueezy",
  async createCheckout(input) {
    const creds = await credentialsOrThrow("lemonsqueezy", input.environment);
    if (!creds.storeId) throw new BillingError("Lemon Squeezy store id is not configured");
    const res = await lemonCall(input.environment, "checkouts", {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            ...(input.email ? { email: input.email } : {}),
            custom: { workspace_id: input.workspaceId, plan_id: input.planId },
          },
          product_options: { redirect_url: input.successUrl },
          test_mode: input.environment === "test",
        },
        relationships: {
          store: { data: { type: "stores", id: String(creds.storeId) } },
          variant: { data: { type: "variants", id: String(input.priceId) } },
        },
      },
    });
    const url = res?.data?.attributes?.url;
    if (!url) throw new BillingError("Lemon Squeezy did not return a checkout URL");
    return { url };
  },
  async cancel(env, subscriptionId) {
    await lemonCall(env, `subscriptions/${subscriptionId}`, undefined, "DELETE");
  },
  async resume(env, subscriptionId) {
    await lemonCall(
      env,
      `subscriptions/${subscriptionId}`,
      { data: { type: "subscriptions", id: String(subscriptionId), attributes: { cancelled: false } } },
      "PATCH",
    );
  },
  async changePlan(env, subscriptionId, priceId) {
    await lemonCall(
      env,
      `subscriptions/${subscriptionId}`,
      {
        data: {
          type: "subscriptions",
          id: String(subscriptionId),
          attributes: { variant_id: Number(priceId), invoice_immediately: true },
        },
      },
      "PATCH",
    );
  },
  async portalUrl(env, { subscriptionId }) {
    if (!subscriptionId) return null;
    const res = await lemonCall(env, `subscriptions/${subscriptionId}`, undefined, "GET");
    return res?.data?.attributes?.urls?.customer_portal ?? null;
  },
  async verify(env, rawBody, headers) {
    const { webhookSecret } = await providerCredentials("lemonsqueezy", env);
    const signature = headers.get("x-signature") ?? "";
    const base = { environment: env, eventId: "", eventType: "", payload: null as any };
    if (!webhookSecret) return { ...base, ok: false, error: "Webhook secret not configured" };
    if (!signature) return { ...base, ok: false, error: "Missing signature" };
    const expected = await hmacHex(webhookSecret, rawBody);
    if (!safeEqual(expected, signature)) return { ...base, ok: false, error: "Signature mismatch" };
    const payload = JSON.parse(rawBody);
    const testMode = payload?.data?.attributes?.test_mode === true;
    const eventName = payload?.meta?.event_name ?? "unknown";
    const id = payload?.data?.id ?? "";
    const stamp = payload?.data?.attributes?.updated_at ?? payload?.meta?.webhook_id ?? "";
    return {
      ok: true,
      environment: testMode ? "test" : "live",
      eventId: `${eventName}:${id}:${stamp}`,
      eventType: eventName,
      payload,
    };
  },
  normalize(event) {
    const p = event.payload;
    const a = p?.data?.attributes ?? {};
    const base = {
      eventId: event.eventId,
      eventType: event.eventType,
      environment: event.environment,
      workspaceId: p?.meta?.custom_data?.workspace_id ?? null,
    };

    if (event.eventType.startsWith("subscription_") && !event.eventType.includes("payment")) {
      return {
        ...base,
        subscription: {
          externalId: String(p?.data?.id),
          customerId: a.customer_id ? String(a.customer_id) : null,
          status: LEMON_STATUS[a.status] ?? "active",
          amountCents: 0,
          currency: "usd",
          currentPeriodEnd: a.renews_at ?? a.ends_at ?? null,
          trialEndsAt: a.trial_ends_at ?? null,
          cancelAtPeriodEnd: Boolean(a.cancelled),
          cancelledAt: a.cancelled ? (a.updated_at ?? null) : null,
          priceId: a.variant_id ? String(a.variant_id) : null,
        },
      };
    }

    if (event.eventType === "subscription_payment_success" || event.eventType === "subscription_payment_failed") {
      const ok = event.eventType === "subscription_payment_success";
      const total = Number(a.total ?? a.total_usd ?? 0);
      return {
        ...base,
        transaction: {
          externalId: String(p?.data?.id),
          kind: "payment",
          amountCents: total,
          currency: a.currency ?? "usd",
          status: ok ? "succeeded" : "failed",
          description: "Subscription payment",
          occurredAt: a.created_at ?? null,
        },
        ...(ok
          ? {
              invoice: {
                externalId: String(p?.data?.id),
                number: a.invoice_number ? String(a.invoice_number) : null,
                amountCents: total,
                currency: a.currency ?? "usd",
                status: a.status ?? "paid",
                hostedUrl: a.urls?.invoice_url ?? null,
                pdfUrl: null,
                issuedAt: a.created_at ?? null,
              },
            }
          : {}),
      };
    }

    if (event.eventType === "subscription_payment_refunded" || event.eventType === "order_refunded") {
      return {
        ...base,
        transaction: {
          externalId: String(p?.data?.id),
          kind: "refund",
          amountCents: Number(a.total ?? a.refunded_amount ?? 0),
          currency: a.currency ?? "usd",
          status: "refunded",
          description: "Refund",
          occurredAt: a.refunded_at ?? a.updated_at ?? null,
        },
      };
    }

    return null;
  },
};

const ADAPTERS: Record<BillingProvider, ProviderAdapter> = { stripe, paddle, lemonsqueezy };

export function getBillingAdapter(provider: BillingProvider): ProviderAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new BillingError(`Unknown billing provider ${provider}`);
  return adapter;
}
