import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { deliveredCount } from "@/lib/engagement-rates";
import { clampMailboxHourlyLimit } from "@/lib/mailbox-hourly-cap";
import { buildCampaignUpdatePatch } from "@/lib/campaign-update-patch";


import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { campaignBodyHtml } from "@/lib/email-html";
import {
  applyUnsubscribeUrl,
  unsubscribeExtras,
  unsubscribeUrl,
  withUnsubscribeSource,
} from "@/lib/unsubscribe";
import { partitionBulkTargets } from "@/lib/campaign-bulk";
import {
  nextEligibleSendAt,
  normalizeSendDays,
  windowStartAt,
  zonedStartOfDay,
} from "@/lib/campaign-schedule";

import { campaignRunStatus } from "@/lib/campaign-run-state";
import {
  campaignColumns,
  campaignLimitColumnsAvailable,
  withCampaignDefaults,
  STEP_COLUMNS,
  AI_VARIABLE_TOKEN,
  renderEmailForLead,
  senderExtras,
  resolveSpintax,

  type Campaign,
  type CampaignStep,
  type CustomVariable,
  type CampaignStepVariant,
  type StepConfig,
} from "@/lib/campaign-model";

export type { Campaign, CampaignStep, CampaignStepVariant, CampaignStatus } from "@/lib/campaign-model";

const workspaceScope = z.object({ workspaceId: z.string().uuid().optional() }).optional();

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceScope.parse(input) ?? {})
  .handler(async ({ data, context }) => {
    let campaignQuery = context.supabase
      .from("campaigns")
      .select(await campaignColumns(context.supabase))
      .order("created_at", { ascending: false });
    // Platform admins can read every campaign through RLS; scope reads to the
    // active workspace so pickers never offer cross-workspace campaigns.
    if (data?.workspaceId) campaignQuery = campaignQuery.eq("workspace_id", data.workspaceId);
    const { data: rows, error } = await campaignQuery;
    if (error) throw new Error(error.message);

    const campaigns = ((rows ?? []) as unknown as Array<Record<string, unknown>>).map(
      (r) => withCampaignDefaults(r as unknown as Record<string, unknown>) as unknown as Campaign,
    );
    if (campaigns.length === 0) return [] as Array<Campaign & { recipients: number; sent: number }>;

    // Exact server-side counts per campaign. Reading every recipient row and
    // counting in JS silently capped at PostgREST's 1,000-row ceiling, so
    // campaigns with a larger audience under-reported their totals.
    const counted = await Promise.all(
      campaigns.map(async (c) => {
        const base = () =>
          context.supabase
            .from("campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id);
        const [totalRes, pendingRes] = await Promise.all([base(), base().eq("status", "pending")]);
        if (totalRes.error) throw new Error(totalRes.error.message);
        if (pendingRes.error) throw new Error(pendingRes.error.message);
        const total = Number(totalRes.count ?? 0);
        return { ...c, recipients: total, sent: total - Number(pendingRes.count ?? 0) };
      }),
    );
    return counted;
  });

export const listCampaignsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceScope.parse(input) ?? {})
  .handler(async ({ data, context }) => {
    const { buildCampaignOverview, applyCampaignRollup, deriveDisplayStatus } = await import(
      "@/lib/campaign-overview"
    );
    const ws = data?.workspaceId;
    // Scope every read to the active workspace (platform admins can otherwise
    // read all tenants' rows through RLS).
    const scope = <T>(q: T): T => (ws ? (q as { eq: (c: string, v: string) => T }).eq("workspace_id", ws) : q);

    // Every per-campaign number is aggregated inside Postgres. Reading the
    // workspace's recipients, messages, replies and conversations into the
    // server was what made this page fall over once a campaign held thousands
    // of leads.
    const [campaignsRes, accountsRes] = await Promise.all([
      scope(
        context.supabase
          .from("campaigns")
          .select("id, name, description, status, tags, created_at, launched_at, sending_account_ids, daily_cap")
          .order("created_at", { ascending: false }),
      ),
      scope(
        context.supabase
          .from("sending_accounts")
          .select("id, from_email, from_name, paused, customer_enabled, status, warmup_status, daily_limit"),
      ),
    ]);

    const failure = [campaignsRes, accountsRes].find((r) => r.error);
    if (failure?.error) throw new Error(failure.error.message);

    const rows = buildCampaignOverview({
      campaigns: (campaignsRes.data ?? []) as never,
      recipients: [],
      messages: [],
      replies: [],
      meetings: [],
      accounts: (accountsRes.data ?? []) as never,
    });

    if (ws) {
      const campaignIds = rows.map((r) => r.id);
      if (campaignIds.length) {
        const { data: rollup, error: rollupError } = await context.supabase.rpc(
          "campaign_overview_rollup",
          { _workspace_id: ws },
        );
        if (rollupError && rollupError.code !== "PGRST202") {
          console.error("[campaigns.overview] campaign_overview_rollup failed", {
            workspaceId: ws,
            code: rollupError.code,
            databaseError: rollupError.message,
            timestamp: new Date().toISOString(),
          });
          throw new Error(
            `Could not load campaign totals (${rollupError.code ?? "error"}): ${rollupError.message}`,
          );
        }
        if (rollupError) {
          // The connected database has not received the aggregate yet. Fall back
          // to bounded database-side counts rather than failing the whole page
          // with a generic "Internal server error".
          console.error("[campaigns.overview] campaign_overview_rollup unavailable; using bounded fallback", {
            workspaceId: ws,
            code: rollupError.code,
          });
          const { campaignOverviewRollupFallback } = await import("@/lib/campaign-overview-rollup.server");
          const dayStart = new Date();
          dayStart.setUTCHours(0, 0, 0, 0);
          const fallback = await campaignOverviewRollupFallback(
            context.supabase,
            rows.map((r) => r.id),
            dayStart.toISOString(),
          );
          applyCampaignRollup(rows, fallback as never, deriveDisplayStatus);
        } else {
          applyCampaignRollup(rows, (rollup ?? []) as never, deriveDisplayStatus);
        }

        const { fetchCampaignStats } = await import("@/lib/campaign-stats.server");
        const stats = await fetchCampaignStats(context.supabase, { workspaceId: ws, campaignIds });
        applyCampaignRollup(
          rows,
          Array.from(stats.byCampaign.values()).map((s) => ({
            campaign_id: s.campaignId,
            leads: s.leads,
            sent: s.sent,
            reached: s.delivered,
            opened: s.opened,
            bounced: s.bounced,
            failed: s.failed,
            replied: s.replied,
            positive_replied: s.positiveReplied,
          })),
          deriveDisplayStatus,
        );
      }
    }


    return rows;
  });




/**
 * Quick daily-limit shortcut from the campaigns table.
 *
 * Writes the same `campaigns.daily_cap` field the schedule tab and the sending
 * backend already use — there is no second limit system.
 */
export const setCampaignDailyLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), dailyCap: z.number().int().min(1).max(10000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS scopes the update to campaigns the caller's workspace owns.
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .update({ daily_cap: data.dailyCap })
      .eq("id", data.id)
      .select("id, daily_cap")
      .maybeSingle();
    if (error) throw new Error("We could not save that daily limit. Please try again.");
    if (!row) throw new Error("Campaign not found.");
    return { id: row.id as string, dailyCap: Number(row.daily_cap ?? data.dailyCap) };
  });

/**
 * Campaign header + headline numbers.
 *
 * Every statistic is aggregated inside Postgres by `campaign_page_summary`, so
 * opening a campaign costs the same whether it has 100 or 10,000 leads: the
 * server never materialises recipient or message rows to count them.
 */
export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(await campaignColumns(context.supabase))
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");

    const campaignRow = campaign as unknown as Record<string, unknown>;
    const runTimezone = String(campaignRow["timezone"] ?? "UTC");
    const runNow = new Date();
    const runDayStart = zonedStartOfDay(runNow, runTimezone);

    const [stepsRes, variantsRes, summaryRes] = await Promise.all([
      context.supabase
        .from("campaign_steps")
        .select(STEP_COLUMNS)
        .eq("campaign_id", data.id)
        .order("step_order", { ascending: true }),
      context.supabase
        .from("campaign_step_variants")
        .select("id, step_id, label, subject, body, weight")
        .eq("campaign_id", data.id)
        .order("label", { ascending: true }),
      context.supabase.rpc("campaign_page_summary", {
        _campaign_id: data.id,
        _day_start: runDayStart.toISOString(),
      }),
    ]);
    const fail = (where: string, err: { code?: string; message: string; details?: unknown }) => {
      // Never let a database failure reach the customer as a bare
      // "Internal server error": the real code lands in the worker log and a
      // readable, specific message reaches the UI.
      console.error(`[campaign.getCampaign] ${where} failed`, {
        campaignId: data.id,
        workspaceId: campaignRow["workspace_id"],
        userId: context.userId,
        code: err.code ?? null,
        databaseError: err.message,
        details: err.details ?? null,
        timestamp: new Date().toISOString(),
      });
      return new Error(`Could not load ${where} (${err.code ?? "error"}): ${err.message}`);
    };
    if (stepsRes.error) throw fail("campaign steps", stepsRes.error);
    if (variantsRes.error) throw fail("campaign step variants", variantsRes.error);
    let summaryData: unknown = summaryRes.data;
    if (summaryRes.error) {
      // PGRST202 = function missing, 57014 = statement timeout on a slow
      // deployed definition. Both mean "the aggregate is unusable here", so we
      // serve the bounded per-count fallback instead of failing the page.
      const recoverable = summaryRes.error.code === "PGRST202" || summaryRes.error.code === "57014";
      if (!recoverable) throw fail("campaign summary", summaryRes.error);
      const { campaignPageSummaryFallback } = await import("@/lib/campaign-page-summary.server");
      console.error("[campaign.getCampaign] campaign_page_summary unavailable; using bounded fallback", {
        campaignId: data.id,
        workspaceId: campaignRow["workspace_id"],
        userId: context.userId,
        code: summaryRes.error.code,
        databaseError: summaryRes.error.message,
        timestamp: new Date().toISOString(),
      });
      summaryData = await campaignPageSummaryFallback(
        context.supabase,
        data.id,
        runDayStart.toISOString(),
      );
    }

    const variants = (variantsRes.data ?? []) as unknown as CampaignStepVariant[];
    const steps = ((stepsRes.data ?? []) as unknown as CampaignStep[]).map((s) => ({
      ...s,
      variants: variants.filter((v) => v.step_id === s.id),
    }));

    const num = (value: unknown) => Number(value ?? 0) || 0;
    const summary = (summaryData ?? {}) as Record<string, unknown>;
    const recipientCounts = (summary["recipients"] ?? {}) as Record<string, unknown>;
    const { fetchOneCampaignStats } = await import("@/lib/campaign-stats.server");
    const workspaceId = String(campaignRow["workspace_id"]);
    const { stats: canonical } = await fetchOneCampaignStats(context.supabase, workspaceId, data.id);
    const { stats: canonicalToday } = await fetchOneCampaignStats(context.supabase, workspaceId, data.id, { from: runDayStart, to: new Date(runNow.getTime() + 1) });
    const deliveryCounts = { ...canonical } as unknown as Record<string, unknown>;
    const todayCounts = { ...canonicalToday } as unknown as Record<string, unknown>;
    const leadStates = Object.fromEntries(
      Object.entries((summary["lead_states"] ?? {}) as Record<string, unknown>).map(
        ([state, count]) => [state, num(count)],
      ),
    ) as Record<string, number>;
    const byStep = ((canonical.byStep ?? []) as Array<Record<string, unknown>>).map((row) => ({
      step: num(row["step"]),
      sent: num(row["sent"]),
      delivered: num(row["delivered"]),
      opened: num(row["opened"]),
      replied: num(row["replied"]),
      scheduled: num(row["scheduled"]),
    }));

    const totalRecipients = num(recipientCounts["total"]);
    const contactedLeads = num(deliveryCounts["contacted"]);
    const sentTodayCount = num(todayCounts["sent"]);
    const sentTotal = num(deliveryCounts["sent"]);
    const scheduledTotal = num(deliveryCounts["scheduled"]);

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
      // A campaign is only "completed" when nothing is owed: no uncontacted
      // leads AND no queued / in-flight / retryable messages (follow-ups).
      remainingRecipients: Math.max(
        0,
        totalRecipients - contactedLeads,
        num(summary["owed_messages"]),
      ),
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

    return {
      campaign: withCampaignDefaults(campaign as unknown as Record<string, unknown>) as unknown as Campaign,
      steps,
      leadStates,
      leadTotal: totalRecipients,
      queue: {
        total: totalRecipients,
        pending: num(recipientCounts["pending"]),
        inProgress: num(recipientCounts["in_progress"]),
        completed: num(recipientCounts["completed"]),
        replied: num(recipientCounts["replied"]),
        bounced: num(recipientCounts["bounced"]),
        unsubscribed: num(recipientCounts["unsubscribed"]),
        failed: num(recipientCounts["failed"]),
        stopped: num(recipientCounts["stopped"]),
        sent: sentTotal,
        byStep,
        nextSendAt: nextSendAt ? nextSendAt.toISOString() : null,
        timezone: runTimezone,
      },
      delivery: {
        totalLeads: totalRecipients,
        contacted: contactedLeads,
        sent: sentTotal,
        accepted: canonical.accepted,
        delivered: canonical.delivered,
        held: canonical.held,
        leadOutcomes: canonical.leadOutcomes,
        attempted: canonical.attempted,
        currentOutcomes: canonical.currentOutcomes,
        delayed: num(deliveryCounts["delayed"]),
        opened: num(deliveryCounts["opened"]),
        clicked: num(deliveryCounts["clicked"]),
        replied: num(deliveryCounts["replied"]),
        positiveReplied: canonical.positiveReplied,
        bounced: num(deliveryCounts["bounced"]),
        complained: num(deliveryCounts["complained"]),
        unsubscribed: num(deliveryCounts["unsubscribed"]),
        failed: num(deliveryCounts["failed"]),
        scheduled: scheduledTotal,
        processing: num(deliveryCounts["sending"]),
        remaining: Math.max(0, totalRecipients - contactedLeads),
        cancelled: num(deliveryCounts["cancelled"]),
        pending: scheduledTotal + num(deliveryCounts["sending"]),
        sentToday: sentTodayCount,
      },
      // Today's engagement, strictly separate from the lifetime numbers above.
      today: {
        sent: sentTodayCount,
        delivered: canonicalToday.delivered,
        opened: num(todayCounts["opened"]),
        clicked: num(todayCounts["clicked"]),
        replied: num(todayCounts["replied"]),
        bounced: num(todayCounts["bounced"]),
        failed: num(todayCounts["failed"]),
      },
      // Current run: quota, capacity and the next scheduled run. Reaching the
      // daily quota is never "paused" and never "completed".
      run: {
        ...runStatus,
        dailyQuota,
        sentThisRun: sentTodayCount,
        // Never held: computed from the shared message-outcome rules, not the legacy RPC.
        retryableFailures: canonical.retryable,
      },
    };
  });




export type CampaignLeadFields = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  phone: string | null;
  linkedin_url: string | null;
  custom_fields: Record<string, string> | null;
};

export type CampaignLeadRow = {
  id: string;
  status: string;
  current_step: number | null;
  next_send_at: string | null;
  last_sent_at: string | null;
  sending_account_id: string | null;
  created_at: string;
  lead_id: string;
  lead: CampaignLeadFields | null;
  deliveryState: string;
  lastEventAt: string | null;
};

const RECIPIENT_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "failed",
  "stopped",
] as const;

const LEAD_EMBED =
  "leads!inner(id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields)";

/**
 * Campaign leads, read one page at a time.
 *
 * Totals are exact server-side COUNTs over `campaign_recipients` (the single
 * source of truth) so a campaign with 1,259 recipients never reports 1,000, and
 * the browser only ever receives the rows it displays.
 */
export const getCampaignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
        search: z.string().trim().max(120).optional(),
        company: z.string().trim().max(120).optional(),
        jobTitle: z.string().trim().max(120).optional(),
        location: z.string().trim().max(120).optional(),
        status: z.enum(RECIPIENT_STATUSES).optional(),
        step: z.number().int().min(0).max(20).optional(),
        accountId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const like = (value: string) => `%${value.replace(/[%,()]/g, " ").trim()}%`;

    // Filters run in the database (including on the embedded lead columns), so
    // the count and the page always describe the same population.
    const applyFilters = <T>(builder: T): T => {
      let q = builder as unknown as {
        eq: (c: string, v: unknown) => typeof q;
        ilike: (c: string, v: string) => typeof q;
        or: (f: string, opts?: { referencedTable: string }) => typeof q;
      };
      q = q.eq("campaign_id", data.campaignId);
      if (data.status) q = q.eq("status", data.status);
      if (data.step !== undefined) q = q.eq("current_step", data.step);
      if (data.accountId) q = q.eq("sending_account_id", data.accountId);
      if (data.company) q = q.ilike("leads.company", like(data.company));
      if (data.jobTitle) q = q.ilike("leads.job_title", like(data.jobTitle));
      if (data.location) {
        const term = like(data.location);
        q = q.or(`country.ilike.${term},city.ilike.${term},state.ilike.${term}`, {
          referencedTable: "leads",
        });
      }
      if (data.search) {
        const term = like(data.search);
        q = q.or(
          `email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`,
          { referencedTable: "leads" },
        );
      }
      return q as unknown as T;
    };

    const from = (data.page - 1) * data.pageSize;
    const { needsLeadJoin, isUnfiltered, leadsForPage } = await import("@/lib/campaign-leads-page");
    const joinLeads = needsLeadJoin(data);
    const unfiltered = isUnfiltered(data, false);
    const RECIPIENT_COLS =
      "id, status, current_step, next_send_at, last_sent_at, sending_account_id, created_at, lead_id";

    const [pageRes, totalRes] = await Promise.all([
      applyFilters(
        context.supabase
          .from("campaign_recipients")
          .select((joinLeads ? `${RECIPIENT_COLS}, ${LEAD_EMBED}` : RECIPIENT_COLS) as string, {
            count: "exact",
          })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      ).range(from, from + data.pageSize - 1),
      // Unfiltered audience size; reuses the page count when nothing is filtered.
      unfiltered
        ? Promise.resolve({ count: null as number | null })
        : context.supabase
            .from("campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", data.campaignId),
    ]);
    if (pageRes.error) throw new Error(pageRes.error.message);

    let recipients = (pageRes.data ?? []) as unknown as Array<
      Omit<CampaignLeadRow, "lead" | "deliveryState" | "lastEventAt"> & {
        leads: CampaignLeadFields | null;
      }
    >;
    if (!joinLeads && recipients.length) {
      const leadMap = await leadsForPage<CampaignLeadFields>(
        context.supabase,
        recipients.map((r) => r.lead_id),
      );
      recipients = recipients
        .map((r) => ({ ...r, leads: leadMap.get(r.lead_id) ?? null }))
        .filter((r) => r.leads);
    }

    // Live delivery state for the visible page only: messages are fetched by
    // this page's recipient ids, never for the whole campaign.
    let live = new Map<string, { state: string; at: string | null }>();
    if (recipients.length) {
      const { fetchByIds } = await import("@/lib/supabase-batch");
      const { aggregateDeliveryStates } = await import("@/lib/campaign-delivery-state");
      const messages = await fetchByIds<Record<string, string | null>>(
        recipients.map((r) => r.id),
        (ids) =>
          context.supabase
            .from("campaign_messages")
            .select(
              "recipient_id, lead_id, status, delivery_status, scheduled_at, sent_at, delivered_at, delayed_at, opened_at, clicked_at, replied_at, unsubscribed_at, complained_at, bounced_at, failed_at, last_event_at, last_error, attempts",
            )
            .eq("campaign_id", data.campaignId)
            .in("recipient_id", ids),
      );
      live = aggregateDeliveryStates(messages);
    }

    const rows: CampaignLeadRow[] = recipients.map((r) => {
      const hit = live.get(r.id) ?? live.get(`lead:${r.lead_id}`) ?? null;
      const { leads, ...rest } = r;
      return {
        ...rest,
        lead: leads,
        deliveryState: hit?.state ?? "not_contacted",
        lastEventAt: hit?.at ?? r.last_sent_at ?? null,
      };
    });

    const matching = pageRes.count ?? rows.length;
    return {
      rows,
      /** Rows matching the active filters (exact). */
      matching,
      /** Every recipient attached to the campaign (exact). */
      total: totalRes.count ?? matching,
      page: data.page,
      pageSize: data.pageSize,
    };
  });



export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireEntitlement, checkUsageLimit } = await import("@/lib/billing/usage.server");
    await requireEntitlement(data.workspaceId, "campaigns");
    await checkUsageLimit(data.workspaceId, "campaigns", 1);

    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: stepErr } = await context.supabase.from("campaign_steps").insert({
      campaign_id: campaign.id,
      workspace_id: data.workspaceId,
      step_order: 1,
      name: "Initial email",
      step_type: "email",
      subject: "Quick question about {{company}}",
      body: "Hi {{first_name | there}},\n\n",
      wait_days: 0,
      wait_hours: 0,
      same_thread: false,
    });
    if (stepErr) throw new Error(stepErr.message);

    return { id: campaign.id as string };
  });

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
    const patch = buildCampaignUpdatePatch(data as unknown as Record<string, unknown>);

    if (
      patch["email_send_limit"] !== undefined &&
      !(await campaignLimitColumnsAvailable(context.supabase))
    ) {
      delete patch["email_send_limit"];
    }
    if (Object.keys(patch).length === 0) return { ok: true, readiness: null };

    const t0 = Date.now();
    // Schedule-affecting columns: only a real change to one of these re-plans
    // the queue. Audience-affecting columns: only these recompute readiness.
    const scheduleKeys = [
      "send_days",
      "send_start_hour",
      "send_end_hour",
      "timezone",
      "daily_cap",
      "max_per_hour",
      "sending_account_ids",
    ];
    const audienceKeys = [
      "list_id",
      "sending_account_ids",
      "max_contacts_per_company",
      "email_send_limit",
    ];

    // Compare against the persisted row (server-side) and keep only real changes.
    const { data: previous, error: prevError } = await context.supabase
      .from("campaigns")
      .select(Object.keys(patch).join(", "))
      .eq("id", data.id)
      .maybeSingle();
    if (prevError) throw new Error(prevError.message);
    if (!previous) throw new Error("We could not save these campaign settings. Please try again.");
    const prev = previous as unknown as Record<string, unknown>;
    const normalize = (key: string, value: unknown): string => {
      if (value === null || value === undefined) return "";
      if (Array.isArray(value)) {
        const items = value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)));
        return JSON.stringify(key === "tags" || key === "custom_variables" ? items : [...items].sort());
      }
      if (typeof value === "object") return JSON.stringify(value);
      if (key === "start_at" || key === "end_at") {
        const t = Date.parse(String(value));
        return Number.isNaN(t) ? String(value) : String(t);
      }
      return String(value);
    };
    for (const key of Object.keys(patch)) {
      if (normalize(key, prev[key]) === normalize(key, patch[key])) delete patch[key];
    }
    const changedKeys = Object.keys(patch);
    if (changedKeys.length === 0) {
      console.log(`[campaign-save] ${data.id} NO CHANGES · TOTAL: ${Date.now() - t0} ms`);
      return { ok: true, readiness: null };
    }
    // Selected mailboxes must be eligible mailboxes of THIS campaign's workspace.
    if (patch["sending_account_ids"] !== undefined) {
      const { assertCampaignMailboxes } = await import("@/lib/campaign-mailboxes");
      await assertCampaignMailboxes(
        context.supabase,
        data.id,
        context.userId,
        (patch["sending_account_ids"] as string[]) ?? [],
      );
    }
    const scheduleChanged = changedKeys.some((k) => scheduleKeys.includes(k));
    const audienceChanged = changedKeys.some((k) => audienceKeys.includes(k));

    // The write is verified: an update that matches no row (workspace/RLS scope)
    // must fail loudly instead of leaving the UI showing a value that was never
    // stored. `daily_cap` is echoed back so the saved limit is provably the one
    // the customer entered — no silent fallback.
    const tWrite = Date.now();
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
    const dbMs = Date.now() - tWrite;

    let rescheduleMs = 0;
    if (scheduleChanged) {
      const tRe = Date.now();
      try {
        // Bounded: the existing scheduler continues any remainder later.
        const { rescheduleCampaignQueue } = await import("@/lib/campaign-reschedule.server");
        await rescheduleCampaignQueue(context.supabase, data.id, new Date(), {
          deadlineAt: new Date(Date.now() + 8_000),
        });
      } catch (rescheduleError) {
        console.error("campaign queue reschedule failed", data.id, rescheduleError);
      }
      rescheduleMs = Date.now() - tRe;
    }

    // Only audience-affecting edits recompute the eligible recipient count.
    let readiness = null;
    if (audienceChanged) {
      const { refreshReadiness } = await import("@/lib/campaign-launch.server");
      try {
        readiness = await refreshReadiness(context.supabase, data.id);
      } catch {
        readiness = null;
      }
    }
    console.log(
      `[campaign-save] ${data.id} fields=${changedKeys.join(",")} · DB UPDATE: ${dbMs} ms · RESCHEDULE REQUIRED: ${scheduleChanged}${scheduleChanged ? ` (${rescheduleMs} ms)` : ""} · READINESS: ${audienceChanged} · TOTAL: ${Date.now() - t0} ms`,
    );
    return { ok: true, readiness };
  });


export const saveCampaignSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        steps: z
          .array(
            z.object({
              name: z.string().max(120).optional(),
              stepType: z
                .enum(["email", "wait", "condition", "task", "crm", "webhook", "stop"])
                .default("email"),
              subject: z.string().max(300),
              body: z.string().max(20000),
              waitDays: z.number().int().min(0).max(90),
              waitHours: z.number().int().min(0).max(23),
              delayMinutes: z.number().int().min(0).max(59).default(0),
              sameThread: z.boolean().default(true),
              config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
              variants: z
                .array(
                  z.object({
                    label: z.string().max(4),
                    subject: z.string().max(300),
                    body: z.string().max(20000),
                    weight: z.number().int().min(0).max(100),
                  }),
                )
                .max(26)
                .default([]),
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Steps and variants are updated IN PLACE. Deleting and re-inserting them
    // nulled step_id/variant_id on every queued message (thousands of rows per
    // save on large campaigns) — that FK cascade was the slow Save.
    const t0 = Date.now();
    const sb = context.supabase;
    const { data: existingSteps, error: exErr } = await sb
      .from("campaign_steps")
      .select("id, step_order")
      .eq("campaign_id", data.campaignId);
    if (exErr) throw new Error(exErr.message);
    const byOrder = new Map<number, string>();
    for (const row of (existingSteps ?? []) as Array<{ id: string; step_order: number }>) {
      byOrder.set(row.step_order, row.id);
    }

    const rowFor = (s: (typeof data.steps)[number], i: number) => ({
      campaign_id: data.campaignId,
      workspace_id: data.workspaceId,
      step_order: i + 1,
      name: s.name ?? "",
      step_type: s.stepType,
      subject: s.subject,
      body: s.body,
      wait_days: i === 0 ? 0 : s.waitDays,
      wait_hours: i === 0 ? 0 : s.waitHours,
      delay_minutes: i === 0 ? 0 : s.delayMinutes,
      same_thread: i === 0 ? false : s.sameThread,
      config: s.config as StepConfig,
    });

    // Remove only steps beyond the new sequence length.
    const extraIds = [...byOrder.entries()]
      .filter(([order]) => order > data.steps.length)
      .map(([, id]) => id);
    if (extraIds.length) {
      const { error: delErr } = await sb.from("campaign_steps").delete().in("id", extraIds);
      if (delErr) throw new Error(delErr.message);
    }

    const stepIds: string[] = [];
    const toInsert: Array<ReturnType<typeof rowFor>> = [];
    await Promise.all(
      data.steps.map(async (s, i) => {
        const id = byOrder.get(i + 1);
        if (!id) {
          toInsert.push(rowFor(s, i));
          return;
        }
        stepIds[i] = id;
        const { error } = await sb.from("campaign_steps").update(rowFor(s, i) as never).eq("id", id);
        if (error) throw new Error(error.message);
      }),
    );
    if (toInsert.length) {
      const { data: inserted, error } = await sb
        .from("campaign_steps")
        .insert(toInsert as never)
        .select("id, step_order");
      if (error) throw new Error(error.message);
      for (const row of (inserted ?? []) as Array<{ id: string; step_order: number }>) {
        stepIds[row.step_order - 1] = row.id;
      }
    }

    // Variants: update by (step, label), insert new, delete removed.
    const activeIds = stepIds.filter(Boolean);
    const { data: existingVariants, error: evErr } = activeIds.length
      ? await sb.from("campaign_step_variants").select("id, step_id, label").in("step_id", activeIds)
      : { data: [], error: null };
    if (evErr) throw new Error(evErr.message);
    const variantKey = (stepId: string, label: string) => `${stepId}::${label}`;
    const existingMap = new Map<string, string>();
    for (const v of (existingVariants ?? []) as Array<{ id: string; step_id: string; label: string }>) {
      existingMap.set(variantKey(v.step_id, v.label), v.id);
    }
    const keep = new Set<string>();
    const variantInserts: Array<Record<string, unknown>> = [];
    const variantUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    data.steps.forEach((draft, i) => {
      const stepId = stepIds[i];
      if (!stepId) return;
      for (const v of draft.variants ?? []) {
        const id = existingMap.get(variantKey(stepId, v.label));
        const patch = { subject: v.subject, body: v.body, weight: v.weight };
        if (id) {
          keep.add(id);
          variantUpdates.push({ id, patch });
        } else {
          variantInserts.push({
            step_id: stepId,
            campaign_id: data.campaignId,
            workspace_id: data.workspaceId,
            label: v.label,
            ...patch,
          });
        }
      }
    });
    const removeVariantIds = [...existingMap.values()].filter((id) => !keep.has(id));
    await Promise.all([
      ...variantUpdates.map(async ({ id, patch }) => {
        const { error } = await sb.from("campaign_step_variants").update(patch as never).eq("id", id);
        if (error) throw new Error(error.message);
      }),
      (async () => {
        if (!removeVariantIds.length) return;
        const { error } = await sb.from("campaign_step_variants").delete().in("id", removeVariantIds);
        if (error) throw new Error(error.message);
      })(),
      (async () => {
        if (!variantInserts.length) return;
        const { error } = await sb.from("campaign_step_variants").insert(variantInserts as never);
        if (error) throw new Error(error.message);
      })(),
    ]);

    console.log(
      `[campaign-save] steps ${data.campaignId} · SEQUENCE UPDATE: ${data.steps.length} steps (${toInsert.length} new, ${extraIds.length} removed) · RESCHEDULE REQUIRED: false · TOTAL: ${Date.now() - t0} ms`,
    );
    return { ok: true };
  });

export const addLeadsToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ campaignId: z.string().uuid(), listId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(await campaignColumns(context.supabase))
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");
    const c = withCampaignDefaults(campaign as unknown as Record<string, unknown>) as unknown as Campaign;

    const { data: list, error: listError } = await context.supabase
      .from("lead_lists")
      .select("id, workspace_id")
      .eq("id", data.listId)
      .maybeSingle();
    if (listError) throw new Error(listError.message);
    if (!list) throw new Error("Lead list not found");
    if (list.workspace_id !== c.workspace_id) {
      throw new Error("That lead list belongs to a different workspace");
    }

    // PostgREST caps rows per request (1,000 by default), so both sides are read
    // page by page. Without this a 10,000-lead list would only ever attach the
    // first page, and the dedupe set would miss existing recipients.
    const PAGE = 1000;
    const readAllPages = async <T>(
      run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    ): Promise<T[]> => {
      const out: T[] = [];
      for (let page = 0; page < 200; page += 1) {
        const from = page * PAGE;
        const { data: rows, error: pageError } = await run(from, from + PAGE - 1);
        if (pageError) throw new Error(pageError.message);
        const batch = rows ?? [];
        out.push(...batch);
        if (batch.length < PAGE) break;
      }
      return out;
    };

    const [listLeads, existingRecipients] = await Promise.all([
      readAllPages<{ id: string; workspace_id: string }>((from, to) =>
        context.supabase
          .from("leads")
          .select("id, workspace_id")
          .eq("list_id", data.listId)
          .eq("workspace_id", c.workspace_id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      readAllPages<{ lead_id: string }>((from, to) =>
        context.supabase
          .from("campaign_recipients")
          .select("lead_id")
          .eq("campaign_id", data.campaignId)
          .order("lead_id", { ascending: true })
          .range(from, to),
      ),
    ]);

    const already = new Set(existingRecipients.map((r) => r.lead_id));
    const seen = new Set<string>();
    const fresh = listLeads.filter((l) => {
      if (already.has(l.id) || seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });

    const accounts = c.sending_account_ids;

    const slot = windowStartAt(new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }, { includeCurrentDay: true }).toISOString();

    if (fresh.length) {
      const rows = fresh.map((lead, index) => ({
        campaign_id: c.id,
        workspace_id: c.workspace_id,
        lead_id: lead.id,
        sending_account_id: accounts.length ? accounts[index % accounts.length]! : null,
        status: "pending" as const,
        current_step: 0,
        next_send_at: c.status === "active" ? slot : null,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: insErr } = await context.supabase
          .from("campaign_recipients")
          .insert(rows.slice(i, i + 500));
        if (insErr) {
          console.error("[campaign_recipients.insert]", {
            userId: context.userId,
            workspaceId: c.workspace_id,
            campaignId: c.id,
            listId: data.listId,
            leadIds: rows.slice(i, i + 500).map((row) => row.lead_id),
            authenticatedRole: context.claims.role ?? "authenticated",
            bearerValidated: true,
            errorCode: insErr.code,
            errorMessage: insErr.message,
            errorDetails: insErr.details,
          });
          throw new Error(insErr.message);
        }
      }
    }

    if (!c.list_id) {
      await context.supabase
        .from("campaigns")
        .update({ list_id: data.listId })
        .eq("id", data.campaignId);
    }

    return { added: fresh.length, skipped: listLeads.length - fresh.length };
  });

export const updateCampaignRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        recipientIds: z.array(z.string().uuid()).min(1).max(1000),
        action: z.enum(["pause", "resume", "remove"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "remove") {
      const { error } = await context.supabase
        .from("campaign_recipients")
        .delete()
        .eq("campaign_id", data.campaignId)
        .in("id", data.recipientIds);
      if (error) throw new Error(error.message);
      return { ok: true, affected: data.recipientIds.length };
    }

    const { error } = await context.supabase
      .from("campaign_recipients")
      .update({ status: data.action === "pause" ? "stopped" : "pending" })
      .eq("campaign_id", data.campaignId)
      .in("id", data.recipientIds);
    if (error) throw new Error(error.message);
    return { ok: true, affected: data.recipientIds.length };
  });

export const sendCampaignTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        sendingAccountId: z.string().uuid(),
        to: z.array(z.string().trim().email()).min(1).max(5),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
        leadId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findCustomerMailbox, sendViaCustomerMailbox } = await import(
      "@/lib/customer-mailbox-send.server"
    );

    const { data: account, error } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, provider_id, from_name, from_email, reply_to, workspace_id, domain_id")
      .eq("id", data.sendingAccountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Sending account not found");


    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id, custom_variables, unsubscribe_enabled")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign || campaign.workspace_id !== account.workspace_id) {
      throw new Error("Campaign and sending account must belong to the same workspace");
    }

    let subject = data.subject;
    let body = data.body;
    if (data.leadId) {
      const { data: lead } = await context.supabase
        .from("leads")
        .select(
          "email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
        )
        .eq("id", data.leadId)
        .maybeSingle();
      if (lead) {
        const l = lead as never;
        const variables = (campaign.custom_variables ?? []) as CustomVariable[];
        // The test email must show the same AI snippet the lead would receive.
        const { data: snippet } = await context.supabase
          .from("ai_personalizations")
          .select("content")
          .eq("campaign_id", data.campaignId)
          .eq("workspace_id", campaign.workspace_id)
          .eq("lead_id", data.leadId)
          .eq("status", "completed")
          .maybeSingle();
        const extras = {
          ...senderExtras(account as never),
          ...unsubscribeExtras({
            workspaceId: campaign.workspace_id as string,
            campaignId: data.campaignId,
            email: (lead as { email: string }).email,
            recipientId: null,
          }),
          ...(snippet?.content ? { [AI_VARIABLE_TOKEN]: snippet.content as string } : {}),
        };
        const rendered = renderEmailForLead({ subject, body }, l, {
          customVariables: variables,
          extras,
        });
        subject = rendered.subject;
        body = rendered.body;
      }
    } else {
      subject = resolveSpintax(subject);
      body = resolveSpintax(body);
    }


    // The mailbox may only send from a domain the customer has verified in
    // MunchReach; the managed provider's own verification is checked at send time.
    if (account.domain_id) {
      const { data: domainRow } = await context.supabase
        .from("sending_domains")
        .select("domain, dns_status")
        .eq("id", account.domain_id)
        .maybeSingle();
      if (domainRow && domainRow.dns_status !== "verified") {
        throw new Error(
          "Your sending domain is not yet verified. Please complete the DNS verification for this domain.",
        );
      }
    }

    // A test email must render exactly like a real send: same mailbox, same
    // signature, resolved server-side from that mailbox.
    const { resolveSignatureForSender } = await import("@/lib/signatures.server");
    const { composeWithSignature } = await import("@/lib/signature-model");
    const testSignature = await resolveSignatureForSender(
      supabaseAdmin,
      account.workspace_id as string,
      account.from_email as string,
      account.from_name as string | null,
    );

    // Test emails must render exactly like a real send, unsubscribe link included.
    const unsubscribeEnabled =
      (campaign as { unsubscribe_enabled?: boolean | null }).unsubscribe_enabled !== false;
    const bodyForRecipient = (to: string) => {
      const url = unsubscribeEnabled
        ? unsubscribeUrl({
            workspaceId: account.workspace_id as string,
            campaignId: data.campaignId,
            email: to,
            recipientId: null,
          })
        : "";
      const withUnsub = url ? applyUnsubscribeUrl(body, url) : body;
      const composed = composeWithSignature({
        body: withUnsub,
        signature: testSignature,
        buildHtml: (value: string) => campaignBodyHtml(value),
      });
      return {
        text: composed.text,
        html: composed.html ?? campaignBodyHtml(composed.text),
        url: composed.text.includes(url) ? url : "",
      };
    };


    const results = [] as Array<{
      to: string;
      ok: boolean;
      status: "accepted" | "rejected";
      message: string;
      requestId: string;
      providerRequestId?: string;
      providerMessageId?: string;
      statusCode?: number;
      providerResponse?: string;
      webhookStatus: string;
    }>;
    // Locked down exactly like campaign dispatch: a test email may only leave
    // through a mailbox the customer connected themselves (SMTP/IMAP, via the
    // mailbox-smtp-relay). There is no shared-provider fallback.
    const customerMailbox = await findCustomerMailbox(
      supabaseAdmin,
      account.workspace_id as string,
      account.from_email as string,
    );
    if (!customerMailbox) {
      const { isMailboxPaused, PAUSED_MAILBOX_MESSAGE } = await import(
        "@/lib/mailbox-active.server"
      );
      const paused = await isMailboxPaused(
        supabaseAdmin,
        account.workspace_id as string,
        account.from_email as string,
      );
      console.warn(
        `[campaign-test] refused: ${paused ? "mailbox paused" : "no connected customer mailbox"} for ${account.from_email} (workspace ${account.workspace_id}).`,
      );
      throw new Error(
        paused
          ? PAUSED_MAILBOX_MESSAGE
          : "Connect a mailbox for this campaign's sender before sending a test.",
      );
    }

    const { consumeUsage, releaseUsage } = await import("@/lib/billing/usage.server");
    for (const to of data.to) {
      const requestId = crypto.randomUUID();
      const { mintCleanReplyAddress } = await import("@/lib/inbound-routing.server");
      const { createOutboundRfcMessageId } = await import(
        "@/lib/outbound-threading.server"
      );
      const replyTo = await mintCleanReplyAddress(account.from_email, {
        workspaceId: account.workspace_id,
        sendingAccountId: account.id,
        leadId: data.leadId ?? null,
        campaignId: data.campaignId,
        purpose: "campaign_test",
      });
      const outboundMessageId = createOutboundRfcMessageId(account.from_email);
      const rendered = bodyForRecipient(to);
      // Test sends leave the platform like any other email, so they meter too.
      await consumeUsage(account.workspace_id, "emails_monthly", 1);
      const result = await sendViaCustomerMailbox(supabaseAdmin, customerMailbox, {
        to,
        subject: `[Test] ${subject}`,
        text: rendered.text,
        html: rendered.html,
        fromName: account.from_name,
        headers: {
          "X-MunchReach-Test-Request-ID": requestId,
          ...(replyTo ? { "Reply-To": replyTo } : {}),
          ...(rendered.url
            ? {
                "List-Unsubscribe": `<${withUnsubscribeSource(rendered.url, "list_unsubscribe")}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
        },
      });

      if (!result.ok) {
        await releaseUsage(account.workspace_id, "emails_monthly", 1).catch(() => {});
      }

      const diagnostic = {
        request_id: requestId,
        workspace_id: account.workspace_id,
        campaign_id: campaign.id,
        sending_account_id: account.id,
        requested_by: context.userId,
        recipient_email: to,
        provider: account.provider,
        provider_message_id: result.messageId ?? null,
        provider_response: result.message,
        status: result.ok ? "accepted" : "rejected",
        error: result.ok ? null : result.message,
      };
      // The raw row keeps the real provider identity for admin diagnostics;
      // the response returned to the customer is scrubbed of infrastructure.
      await supabaseAdmin.from("campaign_test_sends").insert(diagnostic);
      const { registerOutboundMessage } = await import("@/lib/message-classification.server");
      await registerOutboundMessage({
        providerMessageId: result.messageId ?? null,
        messageType: "admin_diagnostic",
        provider: account.provider,
        workspaceId: account.workspace_id,
        sendingAccountId: account.id,
        toEmail: to,
        refTable: "campaign_test_sends",
        refId: null,
        alternateProviderMessageIds: [outboundMessageId],
      });
      const { customerSafeMessage } = await import("@/lib/managed-sending.server");
      results.push({
        to,
        ok: result.ok,
        status: result.ok ? "accepted" : "rejected",
        message: result.ok
          ? "MunchReach accepted the test email."
          : customerSafeMessage(
              result.message,
              "MunchReach could not send this test email. Please contact support.",
            ),
        requestId,
        ...(result.messageId ? { providerMessageId: result.messageId } : {}),
        webhookStatus: "Waiting for delivery confirmation",
      });
    }

    // The UI used to report success even when every recipient was rejected,
    // which is why "sent" test emails never arrived. Surface the failure.
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) {
      throw new Error(failed[0]?.message ?? "MunchReach could not send this test email.");
    }
    return { results, accepted: results.length - failed.length, failed };
  });

export const listCampaignTestDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign) throw new Error("Campaign not found");

    const { data: rows, error } = await context.supabase
      .from("campaign_test_sends")
      .select("id, request_id, recipient_email, provider, provider_message_id, provider_response, status, error, webhook_event_id, webhook_status, webhook_event_type, webhook_received_at, created_at")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const messageIds = (rows ?? []).map((row) => row.provider_message_id).filter(Boolean) as string[];
    const { data: events } = messageIds.length
      ? await supabaseAdmin
          .from("email_events")
          .select("id, message_id, event_type, status, error, created_at")
          .in("message_id", messageIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const { correlateTestSend } = await import("@/lib/test-send-status");
    const { customerSafeMessage } = await import("@/lib/managed-sending.server");
    // The real provider identity stays in the database and Admin → Providers;
    // customers only ever see MunchReach's own sending infrastructure.
    return (rows ?? []).map((row) => {
      const correlated = correlateTestSend(row, (events ?? []) as never);
      return {
        ...correlated,
        provider: null,
        provider_response: correlated.provider_response
          ? customerSafeMessage(correlated.provider_response, "Delivery attempt recorded.")
          : null,
        error: correlated.error
          ? customerSafeMessage(correlated.error, "The message could not be sent. Please contact support.")
          : null,
        webhookError: correlated.webhookError
          ? customerSafeMessage(correlated.webhookError, "Delivery reported a failure.")
          : null,
      };
    });
  });


export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { launchCampaignService } = await import("@/lib/campaign-actions.server");
    return await launchCampaignService(context.supabase, context.userId, data.id);

  });


export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "active", "paused", "completed", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.status === "active") {
      const { data: row } = await context.supabase
        .from("campaigns")
        .select("workspace_id, status")
        .eq("id", data.id)
        .maybeSingle();
      if (row && row.status !== "active") {
        const { requireEntitlement, checkUsageLimit } = await import("@/lib/billing/usage.server");
        await requireEntitlement(row.workspace_id, "campaigns");
        await checkUsageLimit(row.workspace_id, "active_campaigns", 1);
      }
    }
    const { error } = await context.supabase
      .from("campaigns")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        includeLeads: z.boolean().default(false),
        includeSchedule: z.boolean().default(true),
        includeAccounts: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { duplicateCampaignRow } = await import("@/lib/campaign-duplicate.server");
    return await duplicateCampaignRow(context.supabase, context.userId, data);
  });


export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Database-backed launch validation used by the campaign builder. */
export const getCampaignLaunchReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { refreshReadiness } = await import("@/lib/campaign-launch.server");
    return await refreshReadiness(context.supabase, data.id);
  });

export type CampaignLaunchEvent = {
  id: string;
  created_at: string;
  outcome: string;
  ready: boolean;
  issues: { code: string; message: string }[];
  list_name: string | null;
  eligible: number;
  already_queued: number;
  audience: number;
  active_mailboxes: number;
  queued_messages: number;
  total_recipients: number;
  first_send_at: string | null;
  error_message: string | null;
  actor_email: string | null;
};

/** Launch audit trail: readiness checks, blocking reasons and queued counts. */
export const getCampaignLaunchEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ campaignId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("campaign_launch_events")
      .select(
        "id, created_at, outcome, ready, issues, list_name, eligible, already_queued, audience, active_mailboxes, queued_messages, total_recipients, first_send_at, error_message, actor_id",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as unknown as Array<
      Omit<CampaignLaunchEvent, "actor_email"> & { actor_id: string | null }
    >;
    const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
    const emailById = new Map<string, string>();
    if (actorIds.length) {
      const { data: people } = await context.supabase
        .from("profiles")
        .select("id, email")
        .in("id", actorIds);
      for (const p of (people ?? []) as Array<{ id: string; email: string | null }>) {
        if (p.email) emailById.set(p.id, p.email);
      }
    }

    return events.map(({ actor_id, ...rest }) => ({
      ...rest,
      issues: Array.isArray(rest.issues) ? rest.issues : [],
      actor_email: actor_id ? emailById.get(actor_id) ?? null : null,
    })) as CampaignLaunchEvent[];
  });


export type BulkCampaignAction = "pause" | "resume" | "duplicate" | "archive" | "delete";

export type BulkCampaignResult = {
  action: BulkCampaignAction;
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
};

/**
 * Applies one action to many campaigns.
 *
 * Every id is re-read through the caller's RLS-scoped client and re-checked
 * against the caller's workspace membership, so a crafted request can never
 * touch a campaign from another workspace — even when it is mixed into a list
 * of legitimate ids.
 */
export const bulkCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(100),
        action: z.enum(["pause", "resume", "duplicate", "archive", "delete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BulkCampaignResult> => {
    const ids = [...new Set(data.ids)];

    const { data: rows, error } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id, status")
      .in("id", ids);
    if (error) throw new Error(error.message);

    const visible = new Map(
      ((rows ?? []) as Array<{ id: string; workspace_id: string; status: string }>).map((r) => [
        r.id,
        r,
      ]),
    );

    // Membership is verified per workspace with the security-definer helper.
    const workspaceIds = [...new Set([...visible.values()].map((r) => r.workspace_id))];
    const allowedWorkspaces = new Set<string>();
    for (const workspaceId of workspaceIds) {
      const { data: isMember } = await context.supabase.rpc("is_workspace_member", {
        _workspace_id: workspaceId,
        _user_id: context.userId,
      });
      if (isMember) allowedWorkspaces.add(workspaceId);
    }

    const succeeded: string[] = [];
    const { targets, failed } = partitionBulkTargets(ids, data.action, visible, allowedWorkspaces);

    if (targets.length === 0) return { action: data.action, succeeded, failed };

    if (data.action === "duplicate") {
      const { duplicateCampaignRow } = await import("@/lib/campaign-duplicate.server");
      for (const id of targets) {
        try {
          await duplicateCampaignRow(context.supabase, context.userId, { id });
          succeeded.push(id);
        } catch (e) {
          failed.push({ id, reason: (e as Error).message });
        }
      }
      return { action: data.action, succeeded, failed };
    }

    if (data.action === "delete") {
      // One campaign per statement: deleting many at once cascades through
      // every message/recipient in a single query and hits the statement timeout.
      for (const id of targets) {
        const { data: deleted, error: delError } = await context.supabase
          .from("campaigns")
          .delete()
          .eq("id", id)
          .select("id");
        if (delError) failed.push({ id, reason: delError.message });
        else if ((deleted ?? []).length > 0) succeeded.push(id);
        else failed.push({ id, reason: "Delete was blocked by workspace permissions" });
      }
      return { action: data.action, succeeded, failed };
    }

    const status =
      data.action === "pause" ? "paused" : data.action === "resume" ? "active" : "archived";
    const { data: updated, error: updateError } = await context.supabase
      .from("campaigns")
      .update({ status })
      .in("id", targets)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    const done = new Set(((updated ?? []) as Array<{ id: string }>).map((r) => r.id));
    for (const id of targets) {
      if (done.has(id)) succeeded.push(id);
      else failed.push({ id, reason: "Update was blocked by workspace permissions" });
    }
    return { action: data.action, succeeded, failed };
  });

/**
 * Live sending-allowance context for one campaign: the plan's monthly email
 * allowance, what this workspace already used, and what this campaign already
 * sent. The UI renders this; enforcement always re-reads it server-side.
 */
export const getCampaignSendAllowance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const allowanceColumns = (await campaignLimitColumnsAvailable(context.supabase))
      ? "workspace_id, email_send_limit, emails_sent_count, limit_reached_at"
      : "workspace_id";
    const { data: row, error } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
        };
      };
    })
      .from("campaigns")
      .select(allowanceColumns)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Campaign not found");

    const { evaluateEntitlement } = await import("@/lib/billing/usage.server");
    const decision = await evaluateEntitlement(row['workspace_id'] as string, "emails_monthly", 1);

    const monthlyLimit = decision.limit;
    const monthlyUsed = decision.used;
    const monthlyRemaining = monthlyLimit === null ? null : Math.max(monthlyLimit - monthlyUsed, 0);
    const limitRow = withCampaignDefaults(row as unknown as Record<string, unknown>) as Record<string, unknown>;
    const campaignLimit = (limitRow["email_send_limit"] as number | null) ?? 0;
    const campaignSent = (limitRow["emails_sent_count"] as number | null) ?? 0;
    const campaignRemaining = Math.max(campaignLimit - campaignSent, 0);

    return {
      monthlyLimit,
      monthlyUsed,
      monthlyRemaining,
      campaignLimit,
      campaignSent,
      campaignRemaining,
      limitReachedAt: (limitRow["limit_reached_at"] as string | null) ?? null,
      effectiveRemaining:
        monthlyRemaining === null ? campaignRemaining : Math.min(campaignRemaining, monthlyRemaining),
    };
  });
