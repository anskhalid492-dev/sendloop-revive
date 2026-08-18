/**
 * Sending engine entry points used by the app UI.
 *
 * The heavy lifting lives in `dispatch.server.ts` so the automatic campaign
 * runner (cron endpoint) can reuse exactly the same code path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DispatchResult } from "@/lib/dispatch.server";

export type { DispatchResult } from "@/lib/dispatch.server";

export const processCampaignQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        /** When true, messages scheduled in the future are sent immediately too. */
        force: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    const { runCampaign } = await import("@/lib/dispatch.server");
    return runCampaign(context.supabase, {
      campaignId: data.campaignId,
      limit: data.limit,
      force: data.force,
    });
  });
