/**
 * Applies the queue re-plan (see `campaign-reschedule.ts`) to the campaign's
 * pending/scheduled messages after its schedule settings change.
 */
import { normalizeSendDays, zonedDayKey, zonedStartOfDay, zonedStartOfNextDay } from "./campaign-schedule";
import { groupRescheduleUpdates, planQueueReschedule, type QueuedMessageRow } from "./campaign-reschedule";

type AnySupabase = any;

export async function rescheduleCampaignQueue(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
): Promise<number> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, timezone, send_days, send_start_hour, send_end_hour, daily_cap")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return 0;

  const window = {
    timezone: campaign.timezone || "UTC",
    sendDays: normalizeSendDays(campaign.send_days),
    startHour: Number(campaign.send_start_hour ?? 9),
    endHour: Number(campaign.send_end_hour ?? 17),
  };

  const queued: Array<{ id: string; scheduled_at: string | null; step_order: number | null }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("id, scheduled_at, step_order")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "scheduled"])
      .is("sent_at", null)
      .order("step_order", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof queued;
    queued.push(...page);
    if (page.length < pageSize) break;
  }

  const dayStart = zonedStartOfDay(now, window.timezone);
  const nextDayStart = zonedStartOfNextDay(now, window.timezone);
  const [{ count: sentToday, error: sentError }, { count: processingToday, error: processingError }] = await Promise.all([
    supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent")
      .gte("sent_at", dayStart.toISOString())
      .lt("sent_at", nextDayStart.toISOString()),
    supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "processing")
      .gte("scheduled_at", dayStart.toISOString())
      .lt("scheduled_at", nextDayStart.toISOString()),
  ]);
  if (sentError) throw new Error(sentError.message);
  if (processingError) throw new Error(processingError.message);
  // The first configured step has no wait to honour, so those rows may move
  // forward onto today's window; follow-ups keep their own due time as floor.
  const firstStep = queued.reduce<number | null>(
    (min, row) => (row.step_order === null ? min : min === null ? row.step_order : Math.min(min, row.step_order)),
    null,
  );

  const updates = planQueueReschedule(
    queued.map((row) => ({
      id: row.id,
      scheduled_at: row.scheduled_at,
      pull_forward: firstStep === null || row.step_order === null || row.step_order === firstStep,
    })) as QueuedMessageRow[],
    window,
    now,
    {
      dailyLimit: Number(campaign.daily_cap ?? 0),
      occupiedByDay: new Map([
        [zonedDayKey(now, window.timezone), Number(sentToday ?? 0) + Number(processingToday ?? 0)],
      ]),
    },
  );
  if (!updates.length) return 0;


  for (const group of groupRescheduleUpdates(updates)) {
    for (let i = 0; i < group.ids.length; i += 200) {
      const { error } = await supabase
        .from("campaign_messages")
        .update({ scheduled_at: group.scheduledAt })
        .in("id", group.ids.slice(i, i + 200))
        .in("status", ["pending", "scheduled"])
        .is("sent_at", null);
      if (error) throw new Error(error.message);
    }
  }
  return updates.length;
}
