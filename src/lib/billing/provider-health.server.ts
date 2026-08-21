/**
 * Admin → Billing → Providers health data. Server only.
 *
 * Reports, per provider and environment: credential presence, live API
 * connection status, last successful payment, last webhook and last error.
 */
import type { BillingEnvironment, BillingProvider } from "@/lib/billing/model";
import { BILLING_ENVIRONMENTS, BILLING_PROVIDERS, PROVIDER_REQUIREMENTS } from "@/lib/billing/model";
import { admin, getBillingSettings, providerCredentials, writeAudit } from "@/lib/billing/core.server";

export type ProviderHealth = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  enabled: boolean;
  configured: boolean;
  missingSecrets: string[];
  ready: boolean;
  blockers: string[];
  connection: { state: "connected" | "failed" | "unknown"; detail: string | null; checkedAt: string | null };
  lastPayment: { at: string | null; amountCents: number | null; currency: string | null } | null;
  lastWebhook: { at: string | null; eventType: string | null; status: string | null; signatureOk: boolean | null };
  lastError: { message: string | null; at: string | null };
  counts: { webhooks30d: number; failedWebhooks30d: number; activeSubscriptions: number };
};

async function missingSecretsFor(provider: BillingProvider, environment: BillingEnvironment) {
  const creds = await providerCredentials(provider, environment);
  const req = PROVIDER_REQUIREMENTS[provider];
  const present: Record<string, boolean> = {
    [`${provider === "stripe" ? "STRIPE_SECRET_KEY" : provider === "paddle" ? "PADDLE_API_KEY" : "LEMONSQUEEZY_API_KEY"}`]:
      Boolean(creds.apiKey),
    [`${provider === "stripe" ? "STRIPE_WEBHOOK_SECRET" : provider === "paddle" ? "PADDLE_WEBHOOK_SECRET" : "LEMONSQUEEZY_WEBHOOK_SECRET"}`]:
      Boolean(creds.webhookSecret),
    LEMONSQUEEZY_STORE_ID: Boolean(creds.storeId),
  };
  return req.secrets.filter((s) => present[s.name] !== true).map((s) => s.name);
}

export async function loadProviderHealth(): Promise<{
  settings: Awaited<ReturnType<typeof getBillingSettings>>;
  rows: ProviderHealth[];
}> {
  const db = await admin();
  const settings = await getBillingSettings();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const { loadReadiness } = await import("@/lib/billing/readiness.server");
  const [providerRows, hooks, payments, subs, readiness] = await Promise.all([
    db.from("billing_providers").select("*"),
    db
      .from("billing_webhook_events")
      .select("provider, environment, event_type, status, signature_ok, received_at")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(2000),
    db
      .from("billing_transactions")
      .select("provider, environment, amount_cents, currency, kind, status, occurred_at")
      .eq("kind", "payment")
      .order("occurred_at", { ascending: false })
      .limit(1000),
    db.from("billing_subscriptions").select("provider, environment, status"),
    loadReadiness(),
  ]);

  const rows: ProviderHealth[] = [];
  for (const provider of BILLING_PROVIDERS) {
    for (const environment of BILLING_ENVIRONMENTS) {
      const row = (providerRows.data ?? []).find(
        (r: any) => r.provider === provider && r.environment === environment,
      );
      const scopedHooks = (hooks.data ?? []).filter(
        (h: any) => h.provider === provider && h.environment === environment,
      );
      const payment = (payments.data ?? []).find(
        (t: any) => t.provider === provider && t.environment === environment && t.status !== "failed",
      );
      const state = readiness.find((r) => r.provider === provider && r.environment === environment);
      const missingSecrets = await missingSecretsFor(provider, environment);
      const config = (row?.public_config ?? {}) as Record<string, unknown>;
      const connectionState =
        config["connection_state"] === "connected" || config["connection_state"] === "failed"
          ? (config["connection_state"] as "connected" | "failed")
          : "unknown";

      rows.push({
        provider,
        environment,
        enabled: row?.is_enabled === true,
        configured: missingSecrets.length === 0,
        missingSecrets,
        ready: state?.ready === true,
        blockers: state?.blockers ?? [],
        connection: {
          state: connectionState,
          detail: (config["connection_detail"] as string | undefined) ?? null,
          checkedAt: (config["connection_checked_at"] as string | undefined) ?? null,
        },
        lastPayment: payment
          ? {
              at: payment.occurred_at ?? null,
              amountCents: payment.amount_cents ?? null,
              currency: payment.currency ?? null,
            }
          : { at: row?.last_payment_at ?? null, amountCents: null, currency: null },
        lastWebhook: {
          at: scopedHooks[0]?.received_at ?? row?.last_webhook_at ?? null,
          eventType: scopedHooks[0]?.event_type ?? null,
          status: scopedHooks[0]?.status ?? null,
          signatureOk: scopedHooks[0] ? scopedHooks[0].signature_ok === true : null,
        },
        lastError: { message: row?.last_error ?? null, at: row?.last_error_at ?? null },
        counts: {
          webhooks30d: scopedHooks.length,
          failedWebhooks30d: scopedHooks.filter((h: any) => h.status === "failed" || !h.signature_ok)
            .length,
          activeSubscriptions: (subs.data ?? []).filter(
            (s: any) =>
              s.provider === provider &&
              s.environment === environment &&
              ["active", "trialing", "past_due"].includes(s.status),
          ).length,
        },
      });
    }
  }

  return { settings, rows };
}

async function ping(provider: BillingProvider, environment: BillingEnvironment) {
  const creds = await providerCredentials(provider, environment);
  if (!creds.apiKey) throw new Error(`No API key configured for ${provider} ${environment} mode.`);

  if (provider === "stripe") {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `Stripe returned ${res.status}`);
    const live = body?.livemode === true;
    if (live !== (environment === "live"))
      throw new Error(
        `Key mismatch: this key is a ${live ? "live" : "test"} key but it is mapped to ${environment} mode.`,
      );
    return `Connected to Stripe (${live ? "live" : "test"} mode).`;
  }

  if (provider === "paddle") {
    const base = environment === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
    const res = await fetch(`${base}/event-types`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.detail ?? `Paddle returned ${res.status}`);
    return `Connected to Paddle ${environment === "live" ? "production" : "sandbox"}.`;
  }

  if (!creds.storeId) throw new Error("No Lemon Squeezy store ID configured.");
  const res = await fetch(`https://api.lemonsqueezy.com/v1/stores/${creds.storeId}`, {
    headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: "application/vnd.api+json" },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errors?.[0]?.detail ?? `Lemon Squeezy returned ${res.status}`);
  const name = body?.data?.attributes?.name ?? creds.storeId;
  return `Connected to Lemon Squeezy store “${name}”.`;
}

export async function testProviderConnection(
  provider: BillingProvider,
  environment: BillingEnvironment,
  userId: string,
) {
  const db = await admin();
  const checkedAt = new Date().toISOString();
  let ok = true;
  let detail = "";
  try {
    detail = await ping(provider, environment);
  } catch (error) {
    ok = false;
    detail = error instanceof Error ? error.message : "Connection failed.";
  }

  const patch: Record<string, unknown> = {
    provider,
    environment,
    public_config: {
      connection_state: ok ? "connected" : "failed",
      connection_detail: detail,
      connection_checked_at: checkedAt,
    },
  };
  if (!ok) {
    patch["last_error"] = detail;
    patch["last_error_at"] = checkedAt;
  }
  const { error } = await db
    .from("billing_providers")
    .upsert(patch as any, { onConflict: "provider,environment" });
  if (error) throw new Error(error.message);

  await writeAudit({
    userId,
    provider,
    environment,
    action: ok ? "provider.connection_ok" : "provider.connection_failed",
    detail: { detail },
  });
  return { ok, detail, checkedAt };
}

export async function clearProviderError(
  provider: BillingProvider,
  environment: BillingEnvironment,
  userId: string,
) {
  const db = await admin();
  const { error } = await db
    .from("billing_providers")
    .upsert(
      { provider, environment, last_error: null, last_error_at: null } as any,
      { onConflict: "provider,environment" },
    );
  if (error) throw new Error(error.message);
  await writeAudit({ userId, provider, environment, action: "provider.error_cleared" });
  return { ok: true };
}
