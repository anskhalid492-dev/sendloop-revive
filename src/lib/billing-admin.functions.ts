/** Admin billing console server functions. Thin wrappers only. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BillingEnvironment, BillingInterval, BillingProvider } from "@/lib/billing/model";

const providerEnum = z.enum(["stripe", "paddle", "lemonsqueezy"]);
const envEnum = z.enum(["test", "live"]);

export const getBillingConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { loadConsole } = await import("@/lib/billing/admin.server");
    await assertPlatformAdmin(context);
    return loadConsole();
  });

export const updateBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { environment?: BillingEnvironment; graceDays?: number; defaultProvider?: BillingProvider | null }) =>
    z
      .object({
        environment: envEnum.optional(),
        graceDays: z.number().int().min(0).max(90).optional(),
        defaultProvider: providerEnum.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { saveBillingSettings, writeAudit } = await import("@/lib/billing/core.server");
    await assertPlatformAdmin(context);
    const next = await saveBillingSettings(data as Record<string, unknown>);
    await writeAudit({ userId: context.userId, action: "settings.updated", detail: data });
    return next;
  });

export const setBillingProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: BillingProvider; environment: BillingEnvironment; enabled: boolean }) =>
    z.object({ provider: providerEnum, environment: envEnum, enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { setProviderEnabled } = await import("@/lib/billing/admin.server");
    await assertPlatformAdmin(context);
    return setProviderEnabled(data.provider, data.environment, data.enabled, context.userId);
  });

export const upsertPlanPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      planId: string;
      provider: BillingProvider;
      environment: BillingEnvironment;
      interval: BillingInterval;
      externalPriceId: string;
      currency?: string;
    }) =>
      z
        .object({
          planId: z.string().uuid(),
          provider: providerEnum,
          environment: envEnum,
          interval: z.enum(["monthly", "yearly", "lifetime"]),
          externalPriceId: z.string().min(1).max(200),
          currency: z.string().min(3).max(8).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { savePlanPrice } = await import("@/lib/billing/admin.server");
    await assertPlatformAdmin(context);
    return savePlanPrice(data, context.userId);
  });

export const deletePlanPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { removePlanPrice } = await import("@/lib/billing/admin.server");
    await assertPlatformAdmin(context);
    return removePlanPrice(data.id, context.userId);
  });

export const listBillingRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: "subscriptions" | "transactions" | "invoices" | "webhooks" | "audit"; search?: string }) =>
    z
      .object({
        kind: z.enum(["subscriptions", "transactions", "invoices", "webhooks", "audit"]),
        search: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { listRecords } = await import("@/lib/billing/admin.server");
    await assertPlatformAdmin(context);
    return listRecords(data.kind, data.search ?? "");
  });

export const retryBillingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { retryStoredEvent } = await import("@/lib/billing/webhook.server");
    const { writeAudit } = await import("@/lib/billing/core.server");
    await assertPlatformAdmin(context);
    const result = await retryStoredEvent(data.id);
    await writeAudit({ userId: context.userId, action: "webhook.retried", detail: { id: data.id } });
    return result;
  });

export const getBillingReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { loadReadiness } = await import("@/lib/billing/readiness.server");
    await assertPlatformAdmin(context);
    return loadReadiness();
  });

export const getBillingTestChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { loadTestChecklist } = await import("@/lib/billing/readiness.server");
    await assertPlatformAdmin(context);
    return loadTestChecklist();
  });

export const getBillingProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { loadProviderHealth } = await import("@/lib/billing/provider-health.server");
    await assertPlatformAdmin(context);
    return loadProviderHealth();
  });

export const testBillingProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: BillingProvider; environment: BillingEnvironment }) =>
    z.object({ provider: providerEnum, environment: envEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { testProviderConnection } = await import("@/lib/billing/provider-health.server");
    await assertPlatformAdmin(context);
    return testProviderConnection(data.provider, data.environment, context.userId);
  });

export const clearBillingProviderError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: BillingProvider; environment: BillingEnvironment }) =>
    z.object({ provider: providerEnum, environment: envEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { clearProviderError } = await import("@/lib/billing/provider-health.server");
    await assertPlatformAdmin(context);
    return clearProviderError(data.provider, data.environment, context.userId);
  });

const credentialValues = z
  .object({
    apiKey: z.string().max(400).optional(),
    webhookSecret: z.string().max(400).optional(),
    storeId: z.string().max(120).optional(),
  })
  .strict();

export const getBillingProviderSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { loadProviderSecretStatus } = await import("@/lib/billing/secrets.server");
    await assertPlatformAdmin(context);
    return loadProviderSecretStatus();
  });

export const saveBillingProviderSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      provider: BillingProvider;
      environment: BillingEnvironment;
      values: { apiKey?: string; webhookSecret?: string; storeId?: string };
    }) => z.object({ provider: providerEnum, environment: envEnum, values: credentialValues }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { saveProviderSecrets } = await import("@/lib/billing/secrets.server");
    await assertPlatformAdmin(context);
    return saveProviderSecrets({
      provider: data.provider,
      environment: data.environment,
      values: data.values,
      userId: context.userId,
    });
  });

export const clearBillingProviderSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: BillingProvider; environment: BillingEnvironment }) =>
    z.object({ provider: providerEnum, environment: envEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { clearProviderSecrets } = await import("@/lib/billing/secrets.server");
    await assertPlatformAdmin(context);
    return clearProviderSecrets(data.provider, data.environment, context.userId);
  });

/**
 * Creates the Stripe products/prices for every paid plan in one environment and
 * records the plan ↔ price mapping. Idempotent: existing matching prices are
 * reused.
 */
export const syncStripeCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { environment: BillingEnvironment }) =>
    z.object({ environment: envEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    const { syncStripePrices } = await import("@/lib/billing/stripe-sync.server");
    await assertPlatformAdmin(context);
    return syncStripePrices(data.environment, context.userId);
  });

