import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const text = z.string().max(200).optional().nullable();

const crmFilters = z.object({
  workspaceId: uuid.optional().nullable(),
  stageId: uuid.optional().nullable(),
  search: text,
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

const automationFilters = z.object({
  workspaceId: uuid.optional().nullable(),
  status: text,
  trigger: text,
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  search: text,
});

const analyticsFilters = z.object({
  from: z.string(),
  to: z.string(),
  workspaceId: uuid.optional().nullable(),
  campaignId: uuid.optional().nullable(),
  sendingAccountId: uuid.optional().nullable(),
  planId: uuid.optional().nullable(),
});

/** Platform-wide CRM roll-ups and contact directory. */
export const adminCrmDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => crmFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminCrmOverview } = await import("./admin-phase5.server");
    return adminCrmOverview(data);
  });

/** One CRM contact with notes, tasks, activities, campaigns and email history. */
export const adminCrmContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminCrmContact } = await import("./admin-phase5.server");
    return getAdminCrmContact(data.leadId);
  });

/** Every automation across every workspace with real run statistics. */
export const adminListAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => automationFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminAutomations } = await import("./admin-phase5.server");
    return listAdminAutomations(data);
  });

/** Automation detail: workflow steps, execution history and errors. */
export const adminGetAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ automationId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminAutomation } = await import("./admin-phase5.server");
    return getAdminAutomation(data.automationId);
  });

/** Enable, pause or disable a customer automation. Never forces a run. */
export const adminAutomationControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ automationId: uuid, action: z.enum(["enable", "disable", "pause"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminAutomationAction } = await import("./admin-phase5.server");
    return adminAutomationAction(context.userId, data.automationId, data.action);
  });

/** Platform analytics built from source-of-truth tables only. */
export const adminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => analyticsFilters.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminPlatformAnalytics } = await import("./admin-phase5.server");
    return adminPlatformAnalytics(data);
  });

/** Filter options for the analytics dashboard. */
export const adminAnalyticsFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminAnalyticsFilterOptions } = await import("./admin-phase5.server");
    return adminAnalyticsFilterOptions();
  });
