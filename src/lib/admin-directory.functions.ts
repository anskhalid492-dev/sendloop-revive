import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type {
  AdminUserRow,
  AdminUserDetail,
  AdminWorkspaceRow,
  AdminWorkspaceDetail,
} from "./admin-directory.server";

const suspendInput = z.object({
  id: z.string().uuid(),
  suspended: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
});

/** Every platform user with membership, plan and status. Super admin only. */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminUsers } = await import("./admin-directory.server");
    return listAdminUsers();
  });

/** Full profile, membership, billing and support history for one user. */
export const adminGetUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminUser } = await import("./admin-directory.server");
    return getAdminUser(data.userId);
  });

/** Suspend or reactivate a user account. */
export const adminSetUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => suspendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context, { sensitive: true, action: "suspend or restore a user" });
    const { setUserSuspended } = await import("./admin-directory.server");
    return setUserSuspended(context.userId, data.id, data.suspended, data.reason ?? null);
  });

/** Every workspace with owner, members, plan and usage counts. */
export const adminListWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminWorkspaces } = await import("./admin-directory.server");
    return listAdminWorkspaces();
  });

/** Workspace overview, members, usage, billing and activity. */
export const adminGetWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminWorkspace } = await import("./admin-directory.server");
    return getAdminWorkspace(data.workspaceId);
  });

/** Suspend or reactivate a workspace. */
export const adminSetWorkspaceSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => suspendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context, { sensitive: true, action: "suspend or restore a workspace" });
    const { setWorkspaceSuspended } = await import("./admin-directory.server");
    return setWorkspaceSuspended(context.userId, data.id, data.suspended, data.reason ?? null);
  });
