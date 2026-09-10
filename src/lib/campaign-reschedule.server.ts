/**
 * Applies the queue re-plan (see `campaign-reschedule.ts`) to the campaign's
 * pending/scheduled messages after its schedule settings change.
 *
 * The per-day ceiling is the campaign's own daily limit (`campaigns.daily_cap`,
 * the authoritative limit) capped by what the campaign's ELIGIBLE mailboxes can
 * actually deliver in one sending window. The stored limit is never rewritten:
 * raising mailbox limits later automatically unlocks the full campaign limit.
 */
import { normalizeSendDays, zonedDayKey, zonedStartOfDay, zonedStartOfNextDay } from "./campaign-schedule";
import { groupRescheduleUpdates, planQueueReschedule, type QueuedMessageRow } from "./campaign-reschedule";
import { campaignDailyPlan, mailboxDailyCapacity, type CapacityMailbox } from "./campaign-capacity";

type AnySupabase = any;

/**
 * Emails the campaign's eligible mailboxes can deliver in one sending day.
 * Returns 0 when nothing could be read, which leaves the campaign limit alone.
 */
export async function campaignMailboxDailyCapacity(
  supabase: AnySupabase,
  campaign: { sending_account_ids?: string[] | null },
  windowHours: number,
): Promise<number> {
  const poolIds = ((campaign.sending_account_ids ?? []) as string[]).filter(Boolean);
  if (!poolIds.length) return 0;
  try {
    const { data: accounts } = await supabase
      .from("sending_accounts")
      .select("id, provider, status, paused, customer_enabled, daily_limit, hourly_limit")
      .in("id", poolIds);
    if (!accounts?.length) return 0;

    let allowedProviders: Set<string> | null = null;
    const { data: providerRows } = await supabase
      .from("email_providers")
      .select("provider, is_enabled, customer_enabled");
    if (providerRows?.length) {
      allowedProviders = new Set(
        (providerRows as Array<{ provider: string; is_enabled: boolean | null; customer_enabled: boolean | null }>)
          .filter((p) => p.is_enabled !== false && p.customer_enabled !== false)
          .map((p) => String(p.provider)),
      );
    }
    return mailboxDailyCapacity(accounts as CapacityMailbox[], { windowHours, allowedProviders });
  } catch {
    return 0; // capacity unknown: the campaign limit stands on its own
  }
}

export type RescheduleOptions = {
  /** Stop reading/writing once this moment passes; the rest is replanned later. */
  deadlineAt?: Date;
  /** Hard ceiling on queued rows examined in one invocation. */
  maxRows?: number;
  /** Reports how much of the queue this invocation actually covered. */
  onProgress?: (info: { scanned: number; truncated: boolean }) => void;
};

/** Default bound so one invocation can never scan an entire 50k queue. */
export const RESCHEDULE_MAX_ROWS = 2000;

export async function rescheduleCampaignQueue(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
  options: RescheduleOptions = {},
): Promise<number> {
  const maxRows = Math.max(1, options.maxRows ?? RESCHEDULE_MAX_ROWS);
  const outOfBudget = () => Boolean(options.deadlineAt && Date.now() >= options.deadlineAt.getTime());
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, timezone, send_days, send_start_hour, send_end_hour, daily_cap, sending_account_ids")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return 0;

  const window = {
    timezone: campaign.timezone || "UTC",
    sendDays: normalizeSendDays(campaign.send_days),
    startHour: Number(campaign.send_start_hour ?? 9),
    endHour: Number(campaign.send_end_hour ?? 17),
  };


  const { data: firstStepRow, error: stepError } = await supabase
    .from("campaign_steps")
    .select("step_order")
    .eq("campaign_id", campaignId)
    .eq("step_type", "email")
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stepError) throw new Error(stepError.message);

  const queued: Array<{ id: string; scheduled_at: string | null; step_order: number | null }> = [];
  const pageSize = Math.min(1000, maxRows);
  let truncated = false;
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
    // Bounded work: never scan a whole 50k queue inside one invocation, and
    // never keep reading once the caller's budget is gone.
    if (queued.length >= maxRows || outOfBudget()) {
      truncated = true;
      break;
    }
  }
  options.onProgress?.({ scanned: queued.length, truncated });

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
  // Use the sequence definition rather than the smallest queued step. A queue
  // containing only follow-ups must never classify them as first-step rows.
  const firstStep = (firstStepRow as { step_order?: number | null } | null)?.step_order ?? null;

  const updates = planQueueReschedule(
    queued.map((row) => ({
      id: row.id,
      scheduled_at: row.scheduled_at,
      pull_forward: row.step_order === null || (firstStep !== null && row.step_order === firstStep),
    })) as QueuedMessageRow[],
    window,
    now,
    {
      dailyLimit: campaignDailyPlan({
        configuredLimit: Number(campaign.daily_cap ?? 0),
        mailboxCapacity: await campaignMailboxDailyCapacity(
          supabase,
          campaign,
          Math.max(0, window.endHour - window.startHour),
        ),
      }).achievableLimit,

      occupiedByDay: new Map([
        [zonedDayKey(now, window.timezone), Number(sentToday ?? 0) + Number(processingToday ?? 0)],
      ]),
    },
  );
  if (!updates.length) return 0;


  let written = 0;
  for (const group of groupRescheduleUpdates(updates)) {
    // Writing is bounded by the same budget: a partially replanned queue is
    // still entirely valid (rows keep their previous legal time) and the next
    // invocation continues the remainder.
    if (outOfBudget()) return written;
    for (let i = 0; i < group.ids.length; i += 200) {
      const { error } = await supabase
        .from("campaign_messages")
        .update({ scheduled_at: group.scheduledAt })
        .in("id", group.ids.slice(i, i + 200))
        .in("status", ["pending", "scheduled"])
        .is("sent_at", null);
      if (error) throw new Error(error.message);
      written += group.ids.slice(i, i + 200).length;
    }
  }
  return written;
}
