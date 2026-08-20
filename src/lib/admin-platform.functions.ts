/**
 * Phase 7 server functions: platform providers, webhooks and environment
 * status. Every handler re-checks the platform admin role server-side and
 * returns configuration *status* only — never a secret value.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminListPlatformProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { loadPlatformProviders } = await import("@/lib/admin-platform.server");
    return loadPlatformProviders();
  });

export const adminListSendingProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { loadSendingProviders } = await import("@/lib/admin-platform.server");
    return loadSendingProviders();
  });

const testInput = z.object({
  source: z.enum(["email", "billing"]),
  id: z.string().uuid().optional(),
  provider: z.string().max(40).optional(),
  environment: z.enum(["test", "live"]).optional(),
});

export const adminTestPlatformProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof testInput>) => testInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { testPlatformProvider } = await import("@/lib/admin-platform.server");
    return testPlatformProvider({ ...data, userId: context.userId });
  });

const toggleInput = z.object({ id: z.string().uuid(), enabled: z.boolean() });

export const adminSetSendingProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof toggleInput>) => toggleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { setSendingProviderEnabled } = await import("@/lib/admin-platform.server");
    return setSendingProviderEnabled(data.id, data.enabled);
  });

const priorityInput = z.object({ id: z.string().uuid(), priority: z.number().int().min(1).max(999) });

export const adminSetSendingProviderPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof priorityInput>) => priorityInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { setSendingProviderPriority } = await import("@/lib/admin-platform.server");
    return setSendingProviderPriority(data.id, data.priority);
  });

const webhookListInput = z.object({
  source: z.enum(["all", "billing", "referral", "integration"]).default("all"),
  status: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
});

export const adminListWebhookActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof webhookListInput>) => webhookListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { loadWebhookActivity } = await import("@/lib/admin-platform.server");
    return loadWebhookActivity(data);
  });

const detailInput = z.object({
  source: z.enum(["billing", "referral", "integration"]),
  id: z.string().uuid(),
});

export const adminGetWebhookEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof detailInput>) => detailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { loadWebhookDetail } = await import("@/lib/admin-platform.server");
    return loadWebhookDetail(data.source, data.id);
  });

/**
 * Retry only replays a stored event whose signature was already verified at
 * receipt; the billing pipeline's idempotency keys prevent double processing.
 */
export const adminRetryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { retryStoredEvent } = await import("@/lib/billing/webhook.server");
    const { writeAudit } = await import("@/lib/billing/core.server");
    const result = await retryStoredEvent(data.id);
    await writeAudit({ userId: context.userId, action: "webhook.retried", detail: { id: data.id } });
    return result;
  });

export const adminGetEnvironmentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
    await assertPlatformAdmin(context);
    const { loadEnvironmentStatus } = await import("@/lib/admin-platform.server");
    return loadEnvironmentStatus();
  });
