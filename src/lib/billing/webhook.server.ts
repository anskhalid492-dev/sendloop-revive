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
    const env = candidates[0]!;
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
    if (normalized) {
      if (normalized.workspaceId && normalized.subscription?.customerId) {
        await linkCustomer(
          provider,
          verified.environment,
          normalized.workspaceId,
          normalized.subscription.customerId,
        );
      }
      // Stripe checkout completion carries the workspace mapping only.
      if (verified.eventType === "checkout.session.completed") {
        const obj = verified.payload?.data?.object;
        if (obj?.client_reference_id && obj?.customer)
          await linkCustomer(provider, verified.environment, obj.client_reference_id, obj.customer);
      }
      await applyBillingEvent(provider, normalized);
    } else if (verified.eventType === "checkout.session.completed") {
      const obj = verified.payload?.data?.object;
      if (obj?.client_reference_id && obj?.customer)
        await linkCustomer(provider, verified.environment, obj.client_reference_id, obj.customer);
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
    await finishWebhookDelivery(eventRowId, "processed");
    return { ok: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await finishWebhookDelivery(eventRowId, "failed", detail);
    throw new Error(detail);
  }
}
