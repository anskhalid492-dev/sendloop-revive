import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Read-only dashboard aggregate. Everything is scoped by workspace RLS through
 * the caller's own Supabase client.
 */
export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(7).max(90).default(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildCommandCenter } = await import("@/lib/dashboard-command.server");
    return buildCommandCenter(context.supabase as never, data.workspaceId, data.days);
  });
