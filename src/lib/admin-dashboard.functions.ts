import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type {
  AdminAlert,
  AdminActivityItem,
  AdminDashboard,
  AdminMetric,
  AdminSearchResult,
} from "./admin-dashboard.server";
export type { AdminRole } from "./admin-access.server";

/** Platform role of the caller: `super_admin`, `support` or null. */
export const getAdminIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getPlatformRole } = await import("./admin-access.server");
    const role = await getPlatformRole(context);
    return { role, isSuperAdmin: role === "super_admin" };
  });

/** Platform-wide overview metrics, charts, activity feed and system alerts. */
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { buildAdminDashboard } = await import("./admin-dashboard.server");
    return buildAdminDashboard();
  });

/** Global admin search across users, workspaces, campaigns and tickets. */
export const adminGlobalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ term: z.string().max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { runAdminSearch } = await import("./admin-dashboard.server");
    return runAdminSearch(data.term);
  });
