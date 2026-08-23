/**
 * Billing core — server only.
 *
 * Holds the credential lookup, the platform billing settings, the normalized
 * event shape every provider adapter must produce, and the single writer that
 * turns a verified provider event into MunchReach billing records.
 *
 * Nothing here is ever imported by client code; provider secrets never leave
 * this module.
 */
import type {
  BillingEnvironment,
  BillingInterval,
  BillingProvider,
  SubscriptionState,
} from "@/lib/billing/model";
import { secretName } from "@/lib/billing/model";

export type BillingSettings = {
  environment: BillingEnvironment;
  graceDays: number;
  defaultProvider: BillingProvider | null;
};

const DEFAULT_SETTINGS: BillingSettings = {
  environment: "test",
  graceDays: 7,
  defaultProvider: null,
};

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function getBillingSettings(): Promise<BillingSettings> {
  const db = await admin();
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "billing")
    .maybeSingle();
  const value = (data?.value ?? {}) as Partial<BillingSettings>;
  return {
    environment: value.environment === "live" ? "live" : "test",
    graceDays: typeof value.graceDays === "number" ? value.graceDays : DEFAULT_SETTINGS.graceDays,
    defaultProvider: (value.defaultProvider as BillingProvider) ?? null,
  };
}

export async function saveBillingSettings(patch: Partial<BillingSettings>) {
  const db = await admin();
  const current = await getBillingSettings();
  const next = { ...current, ...patch };
  await db.from("platform_settings").upsert({ key: "billing", value: next }, { onConflict: "key" });
  return next;
}

/** Reads a provider secret for one environment from the process env. */
export function readSecret(base: string, environment: BillingEnvironment): string | null {
  const scoped = process.env[secretName(base, environment)];
  if (scoped && scoped.trim()) return scoped.trim();
  // Fall back to an unsuffixed name so a single-environment setup still works.
  const plain = process.env[base];
  return plain && plain.trim() ? plain.trim() : null;
}

export type ProviderCredentials = {
  apiKey: string | null;
  webhookSecret: string | null;
  storeId?: string | null;
};

/** The env-var base name behind each credential field, per provider. */
export const CREDENTIAL_FIELDS: Record<
  BillingProvider,
  { field: "apiKey" | "webhookSecret" | "storeId"; base: string }[]
> = {
  stripe: [
    { field: "apiKey", base: "STRIPE_SECRET_KEY" },
    { field: "webhookSecret", base: "STRIPE_WEBHOOK_SECRET" },
  ],
  paddle: [
    { field: "apiKey", base: "PADDLE_API_KEY" },
    { field: "webhookSecret", base: "PADDLE_WEBHOOK_SECRET" },
  ],
  lemonsqueezy: [
    { field: "apiKey", base: "LEMONSQUEEZY_API_KEY" },
    { field: "webhookSecret", base: "LEMONSQUEEZY_WEBHOOK_SECRET" },
    { field: "storeId", base: "LEMONSQUEEZY_STORE_ID" },
  ],
};

type StoredSecrets = Partial<Record<"apiKey" | "webhookSecret" | "storeId", string>>;

/** Reads the encrypted, admin-entered credentials for one provider+environment. */
export async function storedProviderSecrets(
  provider: BillingProvider,
  environment: BillingEnvironment,
): Promise<StoredSecrets> {
  try {
    const db = await admin();
    const { data } = await db
      .from("billing_provider_secrets")
      .select("ciphertext")
      .eq("provider", provider)
      .eq("environment", environment)
      .maybeSingle();
    if (!data?.ciphertext) return {};
    const { decryptCredentials } = await import("@/lib/provider-credentials.server");
    const plain = decryptCredentials<StoredSecrets>(data.ciphertext);
    return plain ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolves credentials for a provider+environment.
 * Admin-entered (encrypted, database-backed) values win; project environment
 * variables remain a fallback so existing deployments keep working.
 */
export async function providerCredentials(
  provider: BillingProvider,
  environment: BillingEnvironment,
): Promise<ProviderCredentials> {
  const stored = await storedProviderSecrets(provider, environment);
  const pick = (field: "apiKey" | "webhookSecret" | "storeId", base: string) => {
    const value = stored[field];
    if (value && value.trim()) return value.trim();
    return readSecret(base, environment);
  };
  switch (provider) {
    case "stripe":
      return {
        apiKey: pick("apiKey", "STRIPE_SECRET_KEY"),
        webhookSecret: pick("webhookSecret", "STRIPE_WEBHOOK_SECRET"),
      };
    case "paddle":
      return {
        apiKey: pick("apiKey", "PADDLE_API_KEY"),
        webhookSecret: pick("webhookSecret", "PADDLE_WEBHOOK_SECRET"),
      };
    case "lemonsqueezy":
      return {
        apiKey: pick("apiKey", "LEMONSQUEEZY_API_KEY"),
        webhookSecret: pick("webhookSecret", "LEMONSQUEEZY_WEBHOOK_SECRET"),
        storeId: pick("storeId", "LEMONSQUEEZY_STORE_ID"),
      };
  }
}

export async function isConfigured(provider: BillingProvider, environment: BillingEnvironment) {
  const c = await providerCredentials(provider, environment);
  const base = Boolean(c.apiKey) && Boolean(c.webhookSecret);
  return provider === "lemonsqueezy" ? base && Boolean(c.storeId) : base;
}

/* ---------------------------------------------------------------- events */

export type NormalizedBillingEvent = {
  /** Provider event identifier, used for idempotency. */
  eventId: string;
  eventType: string;
  environment: BillingEnvironment;
  workspaceId?: string | null;
  planId?: string | null;
  /** Provider customer id, used to resolve the workspace when the event carries no subscription. */
  customerRef?: string | null;

  subscription?: {
    externalId: string;
    customerId?: string | null;
    status: SubscriptionState;
    interval?: BillingInterval;
    amountCents?: number;
    currency?: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    trialEndsAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    cancelledAt?: string | null;
    priceId?: string | null;
  };
  transaction?: {
    externalId: string;
    kind: "payment" | "refund";
    amountCents: number;
    currency: string;
    status: string;
    description?: string | null;
    occurredAt?: string | null;
  };
  invoice?: {
    externalId: string;
    number?: string | null;
    amountCents: number;
    currency: string;
    status: string;
    hostedUrl?: string | null;
    pdfUrl?: string | null;
    issuedAt?: string | null;
  };
};

export async function writeAudit(entry: {
  workspaceId?: string | null;
  userId?: string | null;
  provider?: BillingProvider | null;
  environment?: BillingEnvironment | null;
  eventId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}) {
  const db = await admin();
  await db.from("billing_audit_log").insert({
    workspace_id: entry.workspaceId ?? null,
    user_id: entry.userId ?? null,
    provider: entry.provider ?? null,
    environment: entry.environment ?? null,
    event_id: entry.eventId ?? null,
    action: entry.action,
    detail: entry.detail ?? {},
  });
}

async function resolvePlanId(
  provider: BillingProvider,
  environment: BillingEnvironment,
  priceId: string | null | undefined,
): Promise<{ planId: string | null; interval: BillingInterval | null }> {
  if (!priceId) return { planId: null, interval: null };
  const db = await admin();
  const { data } = await db
    .from("billing_plan_prices")
    .select("plan_id, billing_interval")
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("external_price_id", priceId)
    .maybeSingle();
  return {
    planId: data?.plan_id ?? null,
    interval: (data?.billing_interval as BillingInterval) ?? null,
  };
}

/**
 * Applies a verified provider event. Safe to call repeatedly with the same
 * event: subscriptions are upserted on the provider subscription id and
 * transactions/invoices on their provider ids, so retries never duplicate.
 */
export async function applyBillingEvent(
  provider: BillingProvider,
  event: NormalizedBillingEvent,
): Promise<{ workspaceId: string | null }> {
  const db = await admin();
  const env = event.environment;
  const settings = await getBillingSettings();
  let workspaceId = event.workspaceId ?? null;
  let subscriptionRowId: string | null = null;
  let planId = event.planId ?? null;

  // Events that carry no subscription (invoices, refunds) still belong to a
  // workspace: resolve it through the provider customer id.
  if (!workspaceId && event.customerRef) {
    const { data: cust } = await db
      .from("billing_customers")
      .select("workspace_id")
      .eq("provider", provider)
      .eq("environment", env)
      .eq("external_customer_id", event.customerRef)
      .maybeSingle();
    workspaceId = cust?.workspace_id ?? null;
  }

  let previousPlanId: string | null = null;
  let previousStatus: string | null = null;

  if (event.subscription) {
    const s = event.subscription;
    const { data: existing } = await db
      .from("billing_subscriptions")
      .select("id, workspace_id, plan_id, billing_interval, status")
      .eq("provider", provider)
      .eq("environment", env)
      .eq("external_subscription_id", s.externalId)
      .maybeSingle();

    previousPlanId = (existing?.plan_id as string | null) ?? null;
    previousStatus = (existing?.status as string | null) ?? null;

    if (!workspaceId && existing?.workspace_id) workspaceId = existing.workspace_id;
    if (!workspaceId && s.customerId) {
      const { data: cust } = await db
        .from("billing_customers")
        .select("workspace_id")
        .eq("provider", provider)
        .eq("environment", env)
        .eq("external_customer_id", s.customerId)
        .maybeSingle();
      workspaceId = cust?.workspace_id ?? null;
    }

    // The price the subscription is actually billed on is authoritative — that
    // is what survives an upgrade or downgrade made in the provider's portal.
    // Checkout metadata is only the fallback for a price we have not mapped yet
    // (and it then backfills the mapping so the next event resolves directly).
    const resolved = await resolvePlanId(provider, env, s.priceId);
    planId = resolved.planId ?? planId ?? existing?.plan_id ?? null;
    if (!resolved.planId && planId && s.priceId) {
      await db.from("billing_plan_prices").upsert(
        {
          plan_id: planId,
          provider,
          environment: env,
          billing_interval: s.interval ?? "monthly",
          external_price_id: s.priceId,
          currency: (s.currency ?? "usd").toLowerCase(),
        },
        { onConflict: "plan_id,provider,environment,billing_interval" },
      );
    }
    const interval = s.interval ?? resolved.interval ?? existing?.billing_interval ?? "monthly";


    if (workspaceId) {
      const graceUntil =
        s.status === "past_due" || s.status === "payment_failed"
          ? new Date(Date.now() + settings.graceDays * 86400000).toISOString()
          : null;
      const accessUntil =
        s.status === "cancelled" || s.status === "expired"
          ? (s.currentPeriodEnd ?? new Date().toISOString())
          : null;

      const row = {
        workspace_id: workspaceId,
        plan_id: planId,
        provider,
        environment: env,
        external_subscription_id: s.externalId,
        external_customer_id: s.customerId ?? null,
        status: s.status,
        billing_interval: interval,
        amount_cents: s.amountCents ?? 0,
        currency: (s.currency ?? "usd").toLowerCase(),
        current_period_start: s.currentPeriodStart ?? null,
        current_period_end: s.currentPeriodEnd ?? null,
        trial_ends_at: s.trialEndsAt ?? null,
        cancel_at_period_end: s.cancelAtPeriodEnd ?? false,
        cancelled_at: s.cancelledAt ?? null,
        access_until: accessUntil,
        grace_until: graceUntil,
        last_event_at: new Date().toISOString(),
      };
      const { data: saved, error } = await db
        .from("billing_subscriptions")
        .upsert(row, { onConflict: "provider,environment,external_subscription_id" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      subscriptionRowId = saved?.id ?? null;

      // Only live-mode events may drive the production plan entitlement.
      if (env === settings.environment) {
        await db.from("workspace_subscriptions").upsert(
          {
            workspace_id: workspaceId,
            plan_id: planId,
            status: s.status === "payment_failed" ? "past_due" : s.status,
            payment_status:
              s.status === "payment_failed" || s.status === "past_due" ? "failed" : "paid",
            billing_interval: interval,
            external_customer_id: s.customerId ?? null,
            external_subscription_id: s.externalId,
            current_period_end: s.currentPeriodEnd ?? null,
            trial_ends_at: s.trialEndsAt ?? null,
          },
          { onConflict: "workspace_id" },
        );
      }
      // Entitlements and credits activate only on a confirmed provider state,
      // never on a frontend checkout success screen.
      if (env === settings.environment && planId && (s.status === "active" || s.status === "trialing")) {
        const { allocatePlanCredits } = await import("@/lib/billing/credits.server");
        const period = s.currentPeriodStart ?? new Date().toISOString();
        try {
          await allocatePlanCredits({ workspaceId, planId, periodStart: period });
        } catch {
          /* credit grant must never fail webhook processing */
        }
      }

      await writeAudit({
        workspaceId,
        provider,
        environment: env,
        eventId: event.eventId,
        action: `subscription.${s.status}`,
        detail: { interval, planId, subscription: s.externalId },
      });
    }
  }

  if (event.transaction) {
    const t = event.transaction;
    await db.from("billing_transactions").upsert(
      {
        workspace_id: workspaceId,
        subscription_id: subscriptionRowId,
        plan_id: planId,
        provider,
        environment: env,
        external_transaction_id: t.externalId,
        provider_event_id: event.eventId,
        kind: t.kind,
        amount_cents: t.amountCents,
        currency: t.currency.toLowerCase(),
        status: t.status,
        description: t.description ?? null,
        occurred_at: t.occurredAt ?? new Date().toISOString(),
      },
      { onConflict: "provider,environment,external_transaction_id,kind" },
    );
    if (t.kind === "payment" && t.status === "succeeded") {
      await db
        .from("billing_providers")
        .update({ last_payment_at: new Date().toISOString() })
        .eq("provider", provider)
        .eq("environment", env);
    }
    await writeAudit({
      workspaceId,
      provider,
      environment: env,
      eventId: event.eventId,
      action: t.kind === "refund" ? "refund" : `payment.${t.status}`,
      detail: { amount_cents: t.amountCents, currency: t.currency },
    });
  }

  if (event.invoice) {
    const i = event.invoice;
    await db.from("billing_invoices").upsert(
      {
        workspace_id: workspaceId,
        subscription_id: subscriptionRowId,
        provider,
        environment: env,
        external_invoice_id: i.externalId,
        number: i.number ?? null,
        amount_cents: i.amountCents,
        currency: i.currency.toLowerCase(),
        status: i.status,
        hosted_url: i.hostedUrl ?? null,
        pdf_url: i.pdfUrl ?? null,
        issued_at: i.issuedAt ?? new Date().toISOString(),
      },
      { onConflict: "provider,environment,external_invoice_id" },
    );
  }

  // Automatic customer notification (welcome/upgrade/invoice/payment/refund).
  // Only production-environment events email customers.
  if (workspaceId && env === settings.environment) {
    const { notifyBillingEvent } = await import("@/lib/billing/notifications.server");
    await notifyBillingEvent(db, {
      provider,
      event,
      workspaceId,
      planId,
      previousPlanId,
      previousStatus,
    });
  }

  return { workspaceId };
}

/** Records the delivery attempt and returns whether this event was already processed. */
export async function recordWebhookDelivery(input: {
  provider: BillingProvider;
  environment: BillingEnvironment;
  eventId: string;
  eventType: string | null;
  signatureOk: boolean;
  payload: unknown;
}) {
  const db = await admin();
  const { data: existing } = await db
    .from("billing_webhook_events")
    .select("id, status")
    .eq("provider", input.provider)
    .eq("environment", input.environment)
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (existing) return { id: existing.id as string, duplicate: existing.status === "processed" };

  const { data } = await db
    .from("billing_webhook_events")
    .insert({
      provider: input.provider,
      environment: input.environment,
      event_id: input.eventId,
      event_type: input.eventType,
      signature_ok: input.signatureOk,
      status: input.signatureOk ? "received" : "rejected",
      http_status: input.signatureOk ? 200 : 401,
      payload: input.payload as any,
    })
    .select("id")
    .single();
  return { id: (data?.id as string) ?? null, duplicate: false };
}

export async function finishWebhookDelivery(
  id: string | null,
  status: "processed" | "failed",
  error?: string,
) {
  if (!id) return;
  const db = await admin();
  await db
    .from("billing_webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error: error ?? null,
      http_status: status === "processed" ? 200 : 500,
    })
    .eq("id", id);
}

export async function touchProviderWebhook(
  provider: BillingProvider,
  environment: BillingEnvironment,
  error?: string | null,
) {
  const db = await admin();
  await db
    .from("billing_providers")
    .update({
      last_webhook_at: new Date().toISOString(),
      ...(error ? { last_error: error, last_error_at: new Date().toISOString() } : {}),
    })
    .eq("provider", provider)
    .eq("environment", environment);
}
