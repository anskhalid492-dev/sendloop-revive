import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { deliveredCount } from "@/lib/engagement-rates";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  campaignColumns,
  STEP_COLUMNS,
  withCampaignDefaults,
  type Campaign,
  type CampaignStep,
  type CampaignStepVariant,
} from "@/lib/campaign-model";
import { nextEligibleSendAt, normalizeSendDays, zonedStartOfDay } from "@/lib/campaign-schedule";
import { campaignRunStatus } from "@/lib/campaign-run-state";

/**
 * Lightweight campaign-page read.
 *
 * This intentionally lives outside campaigns.functions.ts so opening one
 * campaign does not initialize the launch, bulk-import, email-rendering, and
 * personalization code bundled with campaign mutations.
 */
export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const logPhase = (phase: string, phaseStartedAt: number) => {
      console.info("[campaign.getCampaign] phase", {
        campaignId: data.id,
        phase,
        phaseMs: Date.now() - phaseStartedAt,
        totalMs: Date.now() - startedAt,
      });
    };

    let phaseStartedAt = Date.now();
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(await campaignColumns(context.supabase))
      .eq("id", data.id)
      .maybeSingle();
    logPhase("campaign", phaseStartedAt);
    if (error) throw new Error(`Could not load campaign (${error.code ?? "error"}): ${error.message}`);
    if (!campaign) throw new Error("Campaign not found");

    const campaignRow = campaign as unknown as Record<string, unknown>;
    const runTimezone = String(campaignRow["timezone"] ?? "UTC");
    const runNow = new Date();
    const runDayStart = zonedStartOfDay(runNow, runTimezone);

    phaseStartedAt = Date.now();
    const timed = async <T>(phase: string, run: () => PromiseLike<T>): Promise<T> => {
      const at = Date.now();
      const res = await run();
      logPhase(phase, at);
      return res;
    };
    const [stepsRes, variantsRes, summaryRes] = await Promise.all([
      timed("steps", () =>
        context.supabase
          .from("campaign_steps")
          .select(STEP_COLUMNS)
          .eq("campaign_id", data.id)
          .order("step_order", { ascending: true }),
      ),
      timed("variants", () =>
        context.supabase
          .from("campaign_step_variants")
          .select("id, step_id, label, subject, body, weight")
          .eq("campaign_id", data.id)
          .order("label", { ascending: true }),
      ),
      timed("summary-rpc", () =>
        context.supabase.rpc("campaign_page_summary", {
          _campaign_id: data.id,
          _day_start: runDayStart.toISOString(),
        }),
      ),
    ]);
    logPhase("parallel-reads", phaseStartedAt);

    const fail = (where: string, err: { code?: string; message: string; details?: unknown }) => {
      console.error(`[campaign.getCampaign] ${where} failed`, {
        campaignId: data.id,
        workspaceId: campaignRow["workspace_id"],
        userId: context.userId,
        code: err.code ?? null,
        databaseError: err.message,
        details: err.details ?? null,
        totalMs: Date.now() - startedAt,
      });
      return new Error(`Could not load ${where} (${err.code ?? "error"}): ${err.message}`);
    };
    if (stepsRes.error) throw fail("campaign steps", stepsRes.error);
    if (variantsRes.error) throw fail("campaign step variants", variantsRes.error);
    let summaryValue: unknown = summaryRes.data;
    if (summaryRes.error) {
      // Missing function (PGRST202) or a statement timeout (57014) on a slow
      // deployed definition both fall back to bounded per-count aggregates.
      const recoverable = summaryRes.error.code === "PGRST202" || summaryRes.error.code === "57014";
      if (!recoverable) throw fail("campaign summary", summaryRes.error);
      const { campaignPageSummaryFallback } = await import("@/lib/campaign-page-summary.server");
      console.error("[campaign.getCampaign] campaign_page_summary unusable; using bounded fallback", {
        campaignId: data.id,
        code: summaryRes.error.code,
        databaseError: summaryRes.error.message,
      });
      // Hard time budget: when the database is overloaded the fallback's many
      // aggregates can outlive the request, and the runtime kills the whole SSR
      // response as a hang (502). Render the page with empty counters instead.
      const FALLBACK_BUDGET_MS = 8_000;
      let budgetTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        summaryValue = await Promise.race([
          campaignPageSummaryFallback(context.supabase, data.id, runDayStart.toISOString()),
          new Promise<null>((resolve) => {
            budgetTimer = setTimeout(() => resolve(null), FALLBACK_BUDGET_MS);
          }),
        ]);
      } catch (fallbackError) {
        summaryValue = null;
        console.error("[campaign.getCampaign] summary fallback failed", {
          campaignId: data.id,
          databaseError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      } finally {
        if (budgetTimer) clearTimeout(budgetTimer);
      }
      if (summaryValue === null) {
        console.error("[campaign.getCampaign] summary fallback exceeded time budget", {
          campaignId: data.id,
          budgetMs: FALLBACK_BUDGET_MS,
        });
        summaryValue = {};
      }
    }

    phaseStartedAt = Date.now();
    const variants = (variantsRes.data ?? []) as unknown as CampaignStepVariant[];
    const steps = ((stepsRes.data ?? []) as unknown as CampaignStep[]).map((step) => ({
      ...step,
      variants: variants.filter((variant) => variant.step_id === step.id),
    }));
    const numberValue = (value: unknown) => Number(value ?? 0) || 0;
    const summary = (summaryValue ?? {}) as Record<string, unknown>;
    const recipientCounts = (summary["recipients"] ?? {}) as Record<string, unknown>;
    const { fetchOneCampaignStats } = await import("@/lib/campaign-stats.server");
    const workspaceId = String(campaignRow["workspace_id"]);
    const { stats: canonical } = await fetchOneCampaignStats(context.supabase, workspaceId, data.id);
    const { stats: canonicalToday } = await fetchOneCampaignStats(context.supabase, workspaceId, data.id, { from: runDayStart, to: new Date(runNow.getTime() + 1) });
    const deliveryCounts = { ...canonical } as unknown as Record<string, unknown>;
    const todayCounts = { ...canonicalToday } as unknown as Record<string, unknown>;
    const leadStates = Object.fromEntries(
      Object.entries((summary["lead_states"] ?? {}) as Record<string, unknown>).map(
        ([state, count]) => [state, numberValue(count)],
      ),
    ) as Record<string, number>;
    const byStep = ((canonical.byStep ?? []) as Array<Record<string, unknown>>).map((row) => ({
      step: numberValue(row["step"]),
      sent: numberValue(row["sent"]),
      delivered: numberValue(row["delivered"]),
      opened: numberValue(row["opened"]),
      replied: numberValue(row["replied"]),
      scheduled: numberValue(row["scheduled"]),
    }));
    const totalRecipients = numberValue(recipientCounts["total"]);
    const contactedLeads = numberValue(deliveryCounts["contacted"]);
    const sentTodayCount = numberValue(todayCounts["sent"]);
    const sentTotal = numberValue(deliveryCounts["sent"]);
    const scheduledTotal = numberValue(deliveryCounts["scheduled"]);
    const dailyQuota = Number(campaignRow["daily_cap"] ?? 0) || 0;
    const runWindow = {
      timezone: runTimezone,
      sendDays: normalizeSendDays(campaignRow["send_days"]),
      startHour: Number(campaignRow["send_start_hour"] ?? 9),
      endHour: Number(campaignRow["send_end_hour"] ?? 17),
    };
    const runStatus = campaignRunStatus({
      status: String(campaignRow["status"] ?? "draft"),
      dailyQuota,
      sentToday: sentTodayCount,
      remainingRecipients: Math.max(0, totalRecipients - contactedLeads, numberValue(summary["owed_messages"])),
      lifetimeLimit: Number(campaignRow["email_send_limit"] ?? 0) || 0,
      lifetimeSent: sentTotal,
      now: runNow,
      window: runWindow,
    });
    const earliestPending = summary["next_pending_at"]
      ? new Date(String(summary["next_pending_at"]))
      : null;
    const nextSendAt = nextEligibleSendAt({
      now: runNow,
      window: runWindow,
      status: String(campaignRow["status"] ?? "draft"),
      earliestPendingAt: earliestPending,
      pendingCount: scheduledTotal,
    });

    const result = {
      campaign: withCampaignDefaults(campaignRow) as unknown as Campaign,
      steps,
      leadStates,
      leadTotal: totalRecipients,
      queue: {
        total: totalRecipients,
        pending: numberValue(recipientCounts["pending"]),
        inProgress: numberValue(recipientCounts["in_progress"]),
        completed: numberValue(recipientCounts["completed"]),
        replied: numberValue(recipientCounts["replied"]),
        bounced: numberValue(recipientCounts["bounced"]),
        unsubscribed: numberValue(recipientCounts["unsubscribed"]),
        failed: numberValue(recipientCounts["failed"]),
        stopped: numberValue(recipientCounts["stopped"]),
        sent: sentTotal,
        byStep,
        nextSendAt: nextSendAt ? nextSendAt.toISOString() : null,
        timezone: runTimezone,
      },
      delivery: {
        totalLeads: totalRecipients,
        contacted: contactedLeads,
        sent: sentTotal,
        delivered: canonical.delivered,
        held: canonical.held,
        attempted: canonical.attempted,
        currentOutcomes: canonical.currentOutcomes,
        delayed: numberValue(deliveryCounts["delayed"]),
        opened: numberValue(deliveryCounts["opened"]),
        clicked: numberValue(deliveryCounts["clicked"]),
        replied: numberValue(deliveryCounts["replied"]),
        bounced: numberValue(deliveryCounts["bounced"]),
        complained: numberValue(deliveryCounts["complained"]),
        unsubscribed: numberValue(deliveryCounts["unsubscribed"]),
        failed: numberValue(deliveryCounts["failed"]),
        scheduled: scheduledTotal,
        processing: numberValue(deliveryCounts["sending"]),
        remaining: Math.max(0, totalRecipients - contactedLeads),
        cancelled: numberValue(deliveryCounts["cancelled"]),
        pending: scheduledTotal + numberValue(deliveryCounts["sending"]),
        sentToday: sentTodayCount,
      },
      today: {
        sent: sentTodayCount,
        delivered: canonicalToday.delivered,
        opened: numberValue(todayCounts["opened"]),
        clicked: numberValue(todayCounts["clicked"]),
        replied: numberValue(todayCounts["replied"]),
        bounced: numberValue(todayCounts["bounced"]),
        failed: numberValue(todayCounts["failed"]),
      },
      run: {
        ...runStatus,
        dailyQuota,
        sentThisRun: sentTodayCount,
        retryableFailures: numberValue(summary["retryable_failures"]),
      },
    };
    logPhase("transform", phaseStartedAt);
    return result;
  });