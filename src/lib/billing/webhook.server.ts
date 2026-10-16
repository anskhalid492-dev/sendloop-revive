/**
 * Shared webhook pipeline: verify → identify → idempotency → store → process.
 * A webhook is never processed unless the signature verifies.
 */
import type { BillingEnvironment, BillingProvider } from "@/lib/billing/model";
import {
  admin,
  applyBillingEvent,
  finishWebhookDelivery,
  getBillingSettings,
  recordWebhookDelivery,
  touchProviderWebhook,
} from "@/lib/billing/core.server";
import { getBillingAdapter } from "@/lib/billing/providers.server";

async function linkCustomer(
  provider: BillingProvider,
  environment: BillingEnvironment,
  workspaceId: string,
  customerId: string,
) {
  const db = await admin();
  await db
    .from("billing_customers")
    .upsert(
      { workspace_id: workspaceId, provider, environment, external_customer_id: customerId },
      { onConflict: "workspace_id,provider,environment" },
    );
}

export async function handleBillingWebhook(provider: BillingProvider, request: Request) {
  const rawBody = await request.text();
  const adapter = getBillingAdapter(provider);
  const settings = await getBillingSettings();

  // Try both environments so a test-mode delivery is never processed with
  // live credentials (and vice versa).
  const candidates: BillingEnvironment[] =
    settings.environment === "live" ? ["live", "test"] : ["test", "live"];
  let verified = null as Awaited<ReturnType<typeof adapter.verify>> | null;
  let lastError = "No matching webhook secret";
  for (const env of candidates) {
    const result = await adapter.verify(env, rawBody, request.headers);
    if (result.ok) {
      verified = result;
      break;
    }
    lastError = result.error ?? lastError;
  }

  if (!verified) {
    const env = candidates[0] ?? "test";
    await recordWebhookDelivery({
      provider,
      environment: env,
      eventId: `unverified:${crypto.randomUUID()}`,
      eventType: null,
      signatureOk: false,
      payload: { note: "Signature verification failed" },
    });
    await touchProviderWebhook(provider, env, lastError);
    return new Response("Invalid signature", { status: 401 });
  }

  const record = await recordWebhookDelivery({
    provider,
    environment: verified.environment,
    eventId: verified.eventId,
    eventType: verified.eventType,
    signatureOk: true,
    payload: verified.payload,
  });
  await touchProviderWebhook(provider, verified.environment, null);
  if (record.duplicate) return new Response("Duplicate ignored", { status: 200 });

  try {
    const normalized = adapter.normalize(verified);
    const sessionObj = verified.payload?.data?.object;
    const isCheckoutCompletion =
      provider === "stripe" &&
      (verified.eventType === "checkout.session.completed" ||
        verified.eventType === "checkout.session.async_payment_succeeded");

    // The workspace ↔ provider customer link is written before anything else so
    // later events (invoices, refunds) can always resolve their workspace.
    const workspaceRef =
      normalized?.workspaceId ?? sessionObj?.client_reference_id ?? sessionObj?.metadata?.workspace_id;
    const customerRef =
      normalized?.subscription?.customerId ?? normalized?.customerRef ?? sessionObj?.customer;
    if (workspaceRef && customerRef)
      await linkCustomer(provider, verified.environment, workspaceRef, customerRef);

    if (normalized) await applyBillingEvent(provider, normalized);

    // Checkout completion is the authoritative "the customer paid" signal, but
    // the session payload has no subscription detail and Stripe does not
    // guarantee event ordering. Fetching the subscription here means the plan
    // upgrade never depends on customer.subscription.* arriving first.
    if (isCheckoutCompletion && sessionObj?.mode === "subscription" && sessionObj?.subscription) {
      const { fetchStripeSubscription, stripeSubscriptionEvent } = await import(
        "@/lib/billing/providers.server"
      );
      const subId =
        typeof sessionObj.subscription === "string"
          ? sessionObj.subscription
          : sessionObj.subscription?.id;
      const live = await fetchStripeSubscription(verified.environment, subId);
      const mapped = stripeSubscriptionEvent(live);
      await applyBillingEvent(provider, {
        eventId: `${verified.eventId}:subscription`,
        eventType: "checkout.session.subscription_sync",
        environment: verified.environment,
        ...mapped,
        workspaceId: mapped.workspaceId ?? workspaceRef ?? null,
        planId: mapped.planId ?? normalized?.planId ?? null,
      });
    }

    if (isCheckoutCompletion && sessionObj?.mode === "payment") {
      const { applyVerifiedLifetimeCheckout } = await import("@/lib/billing/lifetime-webhook.server");
      await applyVerifiedLifetimeCheckout(verified.environment, verified.eventId, sessionObj);
    }

    await finishWebhookDelivery(record.id, "processed");
    return new Response("ok", { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await finishWebhookDelivery(record.id, "failed", detail);
    await touchProviderWebhook(provider, verified.environment, detail);
    return new Response("Processing failed", { status: 500 });
  }
}

/** Re-runs internal processing for a stored event. Never re-charges anybody. */
export async function retryStoredEvent(eventRowId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("billing_webhook_events")
    .select("*")
    .eq("id", eventRowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Event not found");
  if (!data.signature_ok) throw new Error("Cannot retry an unverified event");

  const adapter = getBillingAdapter(data.provider as BillingProvider);
  const normalized = adapter.normalize({
    ok: true,
    environment: data.environment,
    eventId: data.event_id,
    eventType: data.event_type ?? "",
    payload: data.payload,
  });
  await db
    .from("billing_webhook_events")
    .update({ retry_count: (data.retry_count ?? 0) + 1 })
    .eq("id", eventRowId);
  try {
    if (normalized) await applyBillingEvent(data.provider as BillingProvider, normalized);
    if (data.provider === "stripe" && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(data.event_type ?? "")) {
      const { applyVerifiedLifetimeCheckout } = await import("@/lib/billing/lifetime-webhook.server");
      await applyVerifiedLifetimeCheckout(data.environment, data.event_id, (data.payload as any)?.data?.object);
    }
    await finishWebhookDelivery(eventRowId, "processed");
    return { ok: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await finishWebhookDelivery(eventRowId, "failed", detail);
    throw new Error(detail);
  }
}
