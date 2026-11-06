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

/**
 * Customer-triggered retry: after fixing what caused the failures (paused
 * mailbox, credentials, relay), put every failed-but-never-delivered message
 * back in the queue with a fresh attempt budget. Accepted, bounced and
 * cancelled messages are never touched, so nothing can be sent twice.
 */
export const retryFailedCampaignMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("campaign_messages")
      .select("id, last_error, attempts")
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed")
      .is("sent_at", null)
      .is("bounced_at", null)
      .is("provider_message_id", null)
      .limit(5000);
    if (error) throw new Error(error.message);
    // Held "outcome unknown" sends may already have been delivered: never resend.
    const { isHeldOutcomeUnknown } = await import("@/lib/campaign-send-phase");
    const ids = ((rows ?? []) as Array<{ id: string; last_error: string | null; attempts: number | null }>)
      .filter((row) => !isHeldOutcomeUnknown(row))
      .map((row) => row.id);
    if (!ids.length) return { retried: 0 };

    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error: updateError } = await context.supabase
        .from("campaign_messages")
        .update({ status: "pending", attempts: 0, last_error: null, scheduled_at: null })
        .in("id", chunk)
        .eq("status", "failed").is("sent_at", null).is("provider_message_id", null)
        .is("bounced_at", null).is("delivered_at", null).lt("attempts", 999)
        .or("last_error.is.null,last_error.not.ilike.%send_outcome_unknown%");
      if (updateError) throw new Error(updateError.message);
    }
    return { retried: ids.length };
  });
