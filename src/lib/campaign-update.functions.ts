import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCampaignUpdatePatch } from "@/lib/campaign-update-patch";
import { campaignLimitColumnsAvailable } from "@/lib/campaign-model";
import { clampMailboxHourlyLimit } from "@/lib/mailbox-hourly-cap";

/** Campaign settings write isolated from launch, rendering, and bulk campaign code. */
export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        listId: z.string().uuid().nullable().optional(),
        sendingAccountIds: z.array(z.string().uuid()).max(50).optional(),
        timezone: z.string().max(64).optional(),
        sendDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        sendStartHour: z.number().int().min(0).max(23).optional(),
        sendEndHour: z.number().int().min(1).max(24).optional(),
        dailyCap: z.number().int().min(1).max(10000).optional(),
        stopOnReply: z.boolean().optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        startAt: z.string().nullable().optional(),
        endAt: z.string().nullable().optional(),
        minDelayMinutes: z.number().int().min(0).max(240).optional(),
        randomDelayMinutes: z.number().int().min(0).max(240).optional(),
        maxPerHour: z.number().int().min(1).transform(clampMailboxHourlyLimit).optional(),
        businessDaysOnly: z.boolean().optional(),
        openTracking: z.boolean().optional(),
        clickTracking: z.boolean().optional(),
        textOnly: z.boolean().optional(),
        stopOnCompanyReply: z.boolean().optional(),
        maxContactsPerCompany: z.number().int().min(0).max(50).optional(),
        emailSendLimit: z.number().int().min(1).max(1000000).optional(),
        unsubscribeEnabled: z.boolean().optional(),
        inboxRotationEnabled: z.boolean().optional(),
        inboxRotationStrategy: z.enum(["round_robin", "random", "least_used"]).optional(),
        rotationDailyCapPerInbox: z.number().int().min(0).max(10000).optional(),
        customVariables: z
          .array(
            z.object({
              token: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/),
              label: z.string().trim().min(1).max(60),
              defaultValue: z.string().max(200),
            }),
          )
          .max(50)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const patch = buildCampaignUpdatePatch(data as unknown as Record<string, unknown>);
    if (
      patch["email_send_limit"] !== undefined &&
      !(await campaignLimitColumnsAvailable(context.supabase))
    ) {
      delete patch["email_send_limit"];
    }
    if (Object.keys(patch).length === 0) return { ok: true, readiness: null };

    const { data: saved, error } = await context.supabase
      .from("campaigns")
      .update(patch as never)
      .eq("id", data.id)
      .select("id, daily_cap")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("We could not save these campaign settings. Please try again.");
    if (
      patch["daily_cap"] !== undefined &&
      Number((saved as { daily_cap?: number }).daily_cap ?? 0) !== Number(patch["daily_cap"])
    ) {
      throw new Error("The daily sending limit could not be saved. Please try again.");
    }

    if (
      patch["send_days"] !== undefined ||
      patch["send_start_hour"] !== undefined ||
      patch["send_end_hour"] !== undefined ||
      patch["timezone"] !== undefined ||
      patch["daily_cap"] !== undefined ||
      patch["sending_account_ids"] !== undefined
    ) {
      try {
        const { rescheduleCampaignQueue } = await import("@/lib/campaign-reschedule.server");
        await rescheduleCampaignQueue(context.supabase, data.id);
      } catch (rescheduleError) {
        console.error("[campaign.updateCampaign] reschedule failed", {
          campaignId: data.id,
          error: rescheduleError instanceof Error ? rescheduleError.message : String(rescheduleError),
        });
      }
    }

    let readiness = null;
    try {
      const { refreshReadiness } = await import("@/lib/campaign-launch.server");
      readiness = await refreshReadiness(context.supabase, data.id);
    } catch (readinessError) {
      console.error("[campaign.updateCampaign] readiness refresh failed", {
        campaignId: data.id,
        error: readinessError instanceof Error ? readinessError.message : String(readinessError),
      });
    }
    console.info("[campaign.updateCampaign] complete", {
      campaignId: data.id,
      totalMs: Date.now() - startedAt,
    });
    return { ok: true, readiness };
  });