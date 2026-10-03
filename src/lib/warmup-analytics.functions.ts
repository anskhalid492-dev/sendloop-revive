/** Admin-only platform warmup analytics. Every call re-checks super admin server-side. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z
  .object({ from: day, to: day })
  .refine((r) => r.from <= r.to, "Start date must be on or before end date")
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 731 * 86_400_000, "Range is limited to two years");

const paged = { page: z.number().int().min(1).max(100_000).default(1), pageSize: z.number().int().min(5).max(100).default(20) };

export const adminWarmupAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => range.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { warmupAnalyticsOverview } = await import("./warmup-analytics.server");
    return warmupAnalyticsOverview(data.from, data.to);
  });

export const adminWarmupAnalyticsWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ from: day, to: day, ...paged }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { warmupAnalyticsWorkspaces } = await import("./warmup-analytics.server");
    return warmupAnalyticsWorkspaces(data.from, data.to, data.page, data.pageSize);
  });

export const adminWarmupAnalyticsMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: day,
        to: day,
        ...paged,
        search: z.string().max(200).nullable().default(null),
        status: z.enum(["all", "warming", "paused"]).default("all"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { warmupAnalyticsMailboxes } = await import("./warmup-analytics.server");
    return warmupAnalyticsMailboxes(data);
  });
