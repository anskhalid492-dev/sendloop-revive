/**
 * Applies the queue re-plan (see `campaign-reschedule.ts`) to the campaign's
 * pending/scheduled messages after its schedule settings change.
 */
import { normalizeSendDays } from "./campaign-schedule";
import { groupRescheduleUpdates, planQueueReschedule, type QueuedMessageRow } from "./campaign-reschedule";

type AnySupabase = any;

export async function rescheduleCampaignQueue(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
): Promise<number> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, timezone, send_days, send_start_hour, send_end_hour")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return 0;

  const window = {
    timezone: campaign.timezone || "UTC",
    sendDays: normalizeSendDays(campaign.send_days),
    startHour: Number(campaign.send_start_hour ?? 9),
    endHour: Number(campaign.send_end_hour ?? 17),
  };

  const { data: rows } = await supabase
    .from("campaign_messages")
    .select("id, scheduled_at")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "scheduled"])
    .is("sent_at", null)
    .limit(5000);

  const updates = planQueueReschedule((rows ?? []) as QueuedMessageRow[], window, now);
  if (!updates.length) return 0;

  for (const group of groupRescheduleUpdates(updates)) {
    for (let i = 0; i < group.ids.length; i += 200) {
      await supabase
        .from("campaign_messages")
        .update({ scheduled_at: group.scheduledAt })
        .in("id", group.ids.slice(i, i + 200))
        .in("status", ["pending", "scheduled"])
        .is("sent_at", null);
    }
  }
  return updates.length;
}
