import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { partitionBulkTargets } from "@/lib/campaign-bulk";
import { nextSendSlot, zonedStartOfDay } from "@/lib/campaign-schedule";
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
    const { buildCampaignOverview } = await import("@/lib/campaign-overview");
    const ws = data?.workspaceId;
    // Scope every read to the active workspace (platform admins can otherwise
    // read all tenants' rows through RLS).
    const scope = <T>(q: T): T => (ws ? (q as { eq: (c: string, v: string) => T }).eq("workspace_id", ws) : q);

    // Every per-campaign aggregate is derived from these rows, so they must be
    // read completely: a plain select() stops at 1,000 rows and made large
    // audiences (e.g. 1,259 recipients) report as 1,000.
    const { fetchAllRows } = await import("@/lib/supabase-batch");

    const [campaignsRes, recipients, messages, replies, meetings, accountsRes] = await Promise.all([
      scope(
        context.supabase
          .from("campaigns")
          .select("id, name, description, status, tags, created_at, launched_at, sending_account_ids, daily_cap")
          .order("created_at", { ascending: false }),
      ),
      fetchAllRows(() =>
        scope(context.supabase.from("campaign_recipients").select("campaign_id, lead_id")).order("id", {
          ascending: true,
        }),
      ),
      fetchAllRows(() =>
        scope(
          context.supabase.from("campaign_messages").select("campaign_id, status, to_email, sent_at"),
        ).order("id", { ascending: true }),
      ),
      fetchAllRows(() =>
        scope(
          context.supabase
            .from("campaign_replies")
            .select("campaign_id, lead_id, from_email, sentiment"),
        ).order("id", { ascending: true }),
      ),
      fetchAllRows(() =>
        scope(
          context.supabase
            .from("conversations")
            .select("campaign_id, lead_id, prospect_email, status"),
        ).order("id", { ascending: true }),
      ),
      scope(
        context.supabase
          .from("sending_accounts")
          .select("id, from_email, from_name, paused, customer_enabled, status, warmup_status, daily_limit"),
      ),
    ]);

    const failure = [campaignsRes, accountsRes].find((r) => r.error);
    if (failure?.error) throw new Error(failure.error.message);

    return buildCampaignOverview({
      campaigns: (campaignsRes.data ?? []) as never,
      recipients: recipients as never,
      messages: messages as never,
      replies: replies as never,
      meetings: meetings as never,
      accounts: (accountsRes.data ?? []) as never,
    });
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

    // Recipients and messages are paged: a plain select() stops at 1,000 rows,
    // so every status count and engagement metric of a larger campaign was
    // computed from a truncated set.
    const { fetchAllRows } = await import("@/lib/supabase-batch");

    const [stepsRes, variantsRes, recipients, messages, recipientCountRes] = await Promise.all([
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
      fetchAllRows<{
        id: string;
        status: string;
        current_step: number | null;
        next_send_at: string | null;
        last_sent_at: string | null;
        lead_id: string;
      }>(() =>
        context.supabase
          .from("campaign_recipients")
          .select("id, status, current_step, next_send_at, last_sent_at, lead_id")
          .eq("campaign_id", data.id)
          .order("id", { ascending: true }),
      ),
      // Delivery truth comes from the per-message state the provider events
      // write, never from the initial send response.
      fetchAllRows<Record<string, string | null>>(() =>
        context.supabase
          .from("campaign_messages")
          .select(
            "id, lead_id, status, delivery_status, sent_at, delivered_at, bounced_at, opened_at, clicked_at, complained_at, unsubscribed_at, replied_at, failed_at, delayed_at",
          )
          .eq("campaign_id", data.id)
          .order("id", { ascending: true }),
      ),
      // Exact recipient total, immune to the 1,000-row read cap.
      context.supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.id),
    ]);
    if (stepsRes.error) throw new Error(stepsRes.error.message);
    if (variantsRes.error) throw new Error(variantsRes.error.message);

    const variants = (variantsRes.data ?? []) as unknown as CampaignStepVariant[];
    const steps = ((stepsRes.data ?? []) as unknown as CampaignStep[]).map((s) => ({
      ...s,
      variants: variants.filter((v) => v.step_id === s.id),
    }));
    const totalRecipients = recipientCountRes.count ?? recipients.length;
    const countBy = (status: string) => recipients.filter((r) => r.status === status).length;

    const withTimestamp = (column: string) => messages.filter((m) => m[column]).length;
    const sentMessages = messages.filter((m) => m["sent_at"]);
    const bounced = withTimestamp("bounced_at");
    const failedMessages = messages.filter(
      (m) => m["delivery_status"] === "failed" && !m["bounced_at"],
    ).length;
    // Delivered never includes a message that later bounced or failed.
    const delivered = messages.filter(
      (m) => m["delivered_at"] && !m["bounced_at"] && m["delivery_status"] !== "failed",
    ).length;
    const contactedLeads = new Set(
      sentMessages.map((m) => m["lead_id"]).filter((v): v is string => Boolean(v)),
    ).size;

    // Per-lead delivery breakdown over the FULL audience (messages above are
    // paged, so this is not capped at 1,000). Recipients without any message
    // count as not contacted.
    const { aggregateDeliveryStates } = await import("@/lib/campaign-delivery-state");
    const live = aggregateDeliveryStates(messages);
    const leadStates: Record<string, number> = {};
    for (const r of recipients) {
      const hit = live.get(r.id) ?? live.get(`lead:${r.lead_id}`) ?? null;
      const state = hit?.state ?? "not_contacted";
      leadStates[state] = (leadStates[state] ?? 0) + 1;
    }

    return {
      campaign: withCampaignDefaults(campaign as unknown as Record<string, unknown>) as unknown as Campaign,
      steps,
      leadStates,
      leadTotal: totalRecipients,
      queue: {
        total: totalRecipients,
        pending: countBy("pending"),
        inProgress: countBy("in_progress"),
        completed: countBy("completed"),
        replied: countBy("replied"),
        bounced: countBy("bounced"),
        unsubscribed: countBy("unsubscribed"),
        failed: countBy("failed"),
        stopped: countBy("stopped"),
        sent: recipients.filter((r) => r.last_sent_at).length,
        byStep: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((step) => ({
          step,
          reached: recipients.filter((r) => (r.current_step ?? 0) >= step).length,
        })),
        nextSendAt:
          recipients
            .map((r) => r.next_send_at)
            .filter((v): v is string => Boolean(v))
            .sort()[0] ?? null,
      },
      delivery: {
        totalLeads: totalRecipients,
        contacted: contactedLeads,
        sent: sentMessages.length,
        delivered,
        delayed: messages.filter((m) => m["delivery_status"] === "delayed").length,
        opened: withTimestamp("opened_at"),
        clicked: withTimestamp("clicked_at"),
        replied: withTimestamp("replied_at") || countBy("replied"),
        bounced,
        complained: withTimestamp("complained_at"),
        unsubscribed: withTimestamp("unsubscribed_at") || countBy("unsubscribed"),
        failed: failedMessages,
        pending: messages.filter((m) => !m["sent_at"] && m["status"] !== "cancelled").length,
        // Emails THIS campaign sent since the campaign timezone's local-day
        // start. Never derived from lead counts.
        sentToday: (() => {
          const dayStart = zonedStartOfDay(
            new Date(),
            String((campaign as unknown as Record<string, unknown>)["timezone"] ?? "UTC"),
          );
          return sentMessages.filter((m) => {
            const at = m["sent_at"];
            return at ? new Date(at).getTime() >= dayStart.getTime() : false;
          }).length;
        })(),
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

    const [pageRes, totalRes] = await Promise.all([
      applyFilters(
        context.supabase
          .from("campaign_recipients")
          .select(
            `id, status, current_step, next_send_at, last_sent_at, sending_account_id, created_at, lead_id, ${LEAD_EMBED}` as string,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      ).range(from, from + data.pageSize - 1),
      // Unfiltered audience size, always exact.
      context.supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.campaignId),
    ]);
    if (pageRes.error) throw new Error(pageRes.error.message);

    const recipients = (pageRes.data ?? []) as unknown as Array<
      Omit<CampaignLeadRow, "lead" | "deliveryState" | "lastEventAt"> & {
        leads: CampaignLeadFields | null;
      }
    >;

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
              "recipient_id, lead_id, status, delivery_status, scheduled_at, sent_at, delivered_at, delayed_at, opened_at, clicked_at, replied_at, unsubscribed_at, complained_at, bounced_at, failed_at, last_event_at",
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
        maxPerHour: z.number().int().min(1).max(5000).optional(),
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
    const map: Record<string, string> = {
      name: "name",
      description: "description",
      listId: "list_id",
      sendingAccountIds: "sending_account_ids",
      timezone: "timezone",
      sendDays: "send_days",
      sendStartHour: "send_start_hour",
      sendEndHour: "send_end_hour",
      dailyCap: "daily_cap",
      stopOnReply: "stop_on_reply",
      tags: "tags",
      startAt: "start_at",
      endAt: "end_at",
      minDelayMinutes: "min_delay_minutes",
      randomDelayMinutes: "random_delay_minutes",
      maxPerHour: "max_per_hour",
      businessDaysOnly: "business_days_only",
      openTracking: "open_tracking",
      clickTracking: "click_tracking",
      textOnly: "text_only",
      stopOnCompanyReply: "stop_on_company_reply",
      maxContactsPerCompany: "max_contacts_per_company",
      emailSendLimit: "email_send_limit",
      unsubscribeEnabled: "unsubscribe_enabled",
      inboxRotationEnabled: "inbox_rotation_enabled",
      inboxRotationStrategy: "inbox_rotation_strategy",
      rotationDailyCapPerInbox: "rotation_daily_cap_per_inbox",
      customVariables: "custom_variables",
    };
    const patch: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(map)) {
      const value = (data as Record<string, unknown>)[key];
      if (key !== "id" && value !== undefined) patch[column] = value;
    }
    if (
      patch["email_send_limit"] !== undefined &&
      !(await campaignLimitColumnsAvailable(context.supabase))
    ) {
      delete patch["email_send_limit"];
    }
    if (Object.keys(patch).length === 0) return { ok: true, readiness: null };

    const { error } = await context.supabase
      .from("campaigns")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Any edit that can change the audience recomputes and persists the real
    // eligible recipient count so the readiness bar survives a refresh.
    const { refreshReadiness } = await import("@/lib/campaign-launch.server");
    let readiness = null;
    try {
      readiness = await refreshReadiness(context.supabase, data.id);
    } catch {
      readiness = null;
    }
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
    const { error: delErr } = await context.supabase
      .from("campaign_steps")
      .delete()
      .eq("campaign_id", data.campaignId);
    if (delErr) throw new Error(delErr.message);

    const { data: inserted, error } = await context.supabase
      .from("campaign_steps")
      .insert(
        data.steps.map((s, i) => ({
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
        })) as never,
      )
      .select("id, step_order");
    if (error) throw new Error(error.message);

    const variantRows = (inserted ?? []).flatMap((row) => {
      const draft = data.steps[row.step_order - 1];
      return (draft?.variants ?? []).map((v) => ({
        step_id: row.id,
        campaign_id: data.campaignId,
        workspace_id: data.workspaceId,
        label: v.label,
        subject: v.subject,
        body: v.body,
        weight: v.weight,
      }));
    });
    if (variantRows.length) {
      const { error: vErr } = await context.supabase
        .from("campaign_step_variants")
        .insert(variantRows);
      if (vErr) throw new Error(vErr.message);
    }

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

    const slot = nextSendSlot(new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }).toISOString();

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
    const { sendManagedEmail } = await import("./managed-sending.server");

    const { data: account, error } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, provider_id, from_name, from_email, reply_to, workspace_id, domain_id")
      .eq("id", data.sendingAccountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Sending account not found");


    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id, custom_variables")
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

    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>`;


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
    const { consumeUsage, releaseUsage } = await import("@/lib/billing/usage.server");
    for (const to of data.to) {
      const requestId = crypto.randomUUID();
      // Test sends leave the platform like any other email, so they meter too.
      await consumeUsage(account.workspace_id, "emails_monthly", 1);
      const { mintRequiredReplyAddress } = await import("@/lib/inbound-routing.server");
      const replyTo = await mintRequiredReplyAddress(account.from_email, {
        workspaceId: account.workspace_id,
        sendingAccountId: account.id,
        leadId: data.leadId ?? null,
        campaignId: data.campaignId,
        purpose: "campaign_test",
      });
      const result = await sendManagedEmail(
        supabaseAdmin,
        {
          id: account.id,
          workspace_id: account.workspace_id,
          provider: account.provider,
          provider_id: account.provider_id,
          from_email: account.from_email,
        },
        {
          fromName: account.from_name,
          fromEmail: account.from_email,
          replyTo,
          to,
          subject: `[Test] ${subject}`,
          text: body,
          html,
          headers: { "X-MunchReach-Test-Request-ID": requestId },
        },
        { stage: "test" },
      );

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
        provider_response: result.providerResponse ?? result.message,
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
        alternateProviderMessageIds: [result.rfcMessageId ?? null],
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
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(await campaignColumns(context.supabase))
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");
    const c = withCampaignDefaults(campaign as unknown as Record<string, unknown>) as unknown as Campaign;

    // Plan enforcement before anything is scheduled.
    const { requireEntitlement, checkUsageLimit } = await import("@/lib/billing/usage.server");
    await requireEntitlement(c.workspace_id, "campaigns");
    // No allowance left means no email can leave, so refuse the launch outright.
    await checkUsageLimit(c.workspace_id, "emails_monthly", 1);
    // The campaign-level cap must be a real, sendable number before launch.
    const limitsSupported = await campaignLimitColumnsAvailable(context.supabase);
    const campaignLimit = c.email_send_limit ?? 0;
    if (limitsSupported && campaignLimit <= 0) {
      throw new Error("Choose how many emails this campaign can send before launching.");
    }
    if (limitsSupported) {
      const { evaluateEntitlement } = await import("@/lib/billing/usage.server");
      const decision = await evaluateEntitlement(c.workspace_id, "emails_monthly", 1);
      const remaining = decision.limit === null ? null : Math.max(decision.limit - decision.used, 0);
      const alreadySent = c.emails_sent_count ?? 0;
      if (remaining !== null && campaignLimit - alreadySent > remaining) {
        throw new Error(
          `You only have ${remaining.toLocaleString()} emails available this month.`,
        );
      }
    }

    if (c.status !== "active") await checkUsageLimit(c.workspace_id, "active_campaigns", 1);


    // Validate against the persisted audience relationship, never frontend state.
    const { evaluateLaunchReadiness, persistReadiness, recordLaunchEvent, refreshReadiness } =
      await import("@/lib/campaign-launch.server");

    const readiness = await evaluateLaunchReadiness(context.supabase, c.id);
    await persistReadiness(context.supabase, readiness);
    if (!readiness.ready) {
      // Audit the blocked attempt with the exact reasons before failing.
      await recordLaunchEvent(context.supabase, {
        readiness,
        actorId: context.userId,
        outcome: "blocked",
        errorMessage: readiness.issues[0]!.message,
      });
      throw new Error(readiness.issues[0]!.message);
    }


    const { data: steps, error: sErr } = await context.supabase
      .from("campaign_steps")
      .select("id, subject, body, step_type")
      .eq("campaign_id", c.id)
      .order("step_order", { ascending: true });
    if (sErr) throw new Error(sErr.message);
    const firstStep = steps?.find((s) => s.step_type === "email");
    if (!firstStep || !firstStep.subject.trim() || !firstStep.body.trim()) {
      throw new Error("The first email step needs a subject and a body before launching.");
    }

    const { data: accounts, error: aErr } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, status, customer_enabled, paused, daily_limit, sent_today, from_name, from_email")
      .in("id", c.sending_account_ids);
    if (aErr) throw new Error(aErr.message);
    const active = (accounts ?? []).filter(
      (a) => a.status !== "disabled" && a.customer_enabled && !a.paused,
    );
    if (!active.length) throw new Error("No active sending accounts are available.");

    // Inbox rotation. When rotation is off every send goes through the first
    // active mailbox; otherwise leads are spread across mailboxes using the
    // strategy chosen in the campaign settings, honouring the per-inbox cap.
    const campaignVariables = (c.custom_variables ?? []) as CustomVariable[];
    const rotationOn = c.inbox_rotation_enabled !== false;
    const perInboxCap = c.rotation_daily_cap_per_inbox || 0;
    let pool = active.map((a) => ({
      id: a.id,
      headroom: Math.max(
        0,
        Math.min(
          perInboxCap || Number.MAX_SAFE_INTEGER,
          (a.daily_limit ?? 0) - (a.sent_today ?? 0),
        ),
      ),
      sentToday: a.sent_today ?? 0,
    }));

    if (!rotationOn) pool = pool.slice(0, 1);
    else if (c.inbox_rotation_strategy === "random")
      pool = pool
        .map((a) => ({ a, r: Math.random() }))
        .sort((x, y) => x.r - y.r)
        .map(({ a }) => a);
    else if (c.inbox_rotation_strategy === "least_used")
      pool = [...pool].sort((a, b) => a.sentToday - b.sentToday || b.headroom - a.headroom);

    const usable = pool.map((a) => a.id);

    /** Pick the mailbox for the nth lead, skipping inboxes that are out of headroom. */
    const remaining = new Map(pool.map((a) => [a.id, a.headroom] as const));
    let cursor = 0;
    const pickAccount = (): string => {
      for (let attempt = 0; attempt < usable.length; attempt += 1) {
        const id = usable[(cursor + attempt) % usable.length]!;
        const left = remaining.get(id) ?? 0;
        if (left > 0) {
          remaining.set(id, left - 1);
          cursor = (cursor + attempt + 1) % usable.length;
          return id;
        }
      }
      // Everything is at capacity for today — fall back to plain rotation so the
      // queue still gets built; pacing is enforced again when messages are sent.
      const id = usable[cursor % usable.length]!;
      cursor += 1;
      return id;
    };

    // AI personalization: {{ai_personalization}} is resolved from stored,
    // completed snippets only. Leads that aren't personalized yet follow the
    // campaign's fallback rule — and with "hold" they are not materialised at
    // all, so no weaker email ever goes out ahead of its personalization.
    const { campaignAiSettings, aiExtras } = await import("@/lib/ai-personalization.server");
    // URL-safe id filters + full pagination: see supabase-batch for why.
    const { fetchByIds, fetchAllRows } = await import("@/lib/supabase-batch");
    const aiSettings = await campaignAiSettings(context.supabase, c.id);
    const aiContent = new Map<string, string>();
    if (aiSettings.enabled) {
      const aiRows = await fetchAllRows<{ lead_id: string; content: string | null }>(() =>
        context.supabase
          .from("ai_personalizations")
          .select("lead_id, content")
          .eq("campaign_id", c.id)
          .eq("status", "completed"),
      );
      for (const row of aiRows) {
        if (row.content?.trim()) aiContent.set(row.lead_id, row.content.trim());
      }
    }
    const aiFor = (leadId: string): { extras: Record<string, string>; hold: boolean } =>
      aiSettings.enabled
        ? aiExtras(aiSettings.config, aiContent.get(leadId) ?? null)
        : { extras: {}, hold: false };
    let heldForAi = 0;

    // Only the lead ids the readiness check proved eligible get queued.
    // The ids travel in the URL, so they are read back in URL-safe chunks:
    // a single `in.()` filter with ~1,000 UUIDs is rejected with HTTP 400.
    const LEAD_FIELDS =
      "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields";
    let leads: Array<Record<string, unknown>> = [];
    if (readiness.eligibleLeadIds.length) {
      leads = await fetchByIds<Record<string, unknown>>(
        readiness.eligibleLeadIds,
        (ids) => context.supabase.from("leads").select(LEAD_FIELDS).in("id", ids),
      );
    }

    // Paged so campaigns with more than 1,000 recipients are deduplicated
    // correctly instead of re-inserting rows that already exist.
    const existing = await fetchAllRows<{ lead_id: string }>(() =>
      context.supabase.from("campaign_recipients").select("lead_id").eq("campaign_id", c.id),
    );
    const already = new Set(existing.map((r) => r.lead_id));

    const firstSlot = nextSendSlot(c.start_at ? new Date(c.start_at) : new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }).toISOString();

    const fresh = leads.filter((l) => !already.has(String(l["id"]))) as Array<
      Record<string, unknown> & { id: string; email: string }
    >;
    if (fresh.length) {
      const accountById = new Map(
        (accounts ?? []).map((a) => [a.id, a as { id: string }] as const),
      );
      const senderFor = (id: string | null) =>
        senderExtras(
          (accounts ?? []).find((a) => a.id === id) as never,
        );
      const rows = fresh.map((lead) => ({
        campaign_id: c.id,
        workspace_id: c.workspace_id,
        lead_id: lead.id,
        sending_account_id: pickAccount(),
        status: "pending" as const,
        current_step: 0,
        next_send_at: firstSlot,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { data: inserted, error: insErr } = await context.supabase
          .from("campaign_recipients")
          .insert(slice)
          .select("id, lead_id, sending_account_id");
        if (insErr) throw new Error(insErr.message);

        // Materialise the first email of the sequence into the sending queue.
        const leadById = new Map(
          (fresh as unknown as Array<{ id: string }>).map((l) => [l.id, l] as const),
        );
        const messages = (inserted ?? [])
          .map((recipient) => {
            const lead = leadById.get(recipient.lead_id) as never;
            if (!lead) return null;
            const ai = aiFor(recipient.lead_id);
            if (ai.hold) {
              heldForAi += 1;
              return null;
            }
            return {
              workspace_id: c.workspace_id,
              campaign_id: c.id,
              recipient_id: recipient.id,
              lead_id: recipient.lead_id,
              step_id: firstStep.id,
              sending_account_id: recipient.sending_account_id,
              step_order: 1,
              status: "scheduled" as const,
              to_email: (lead as { email: string }).email,
              ...renderEmailForLead(firstStep, lead, {
                customVariables: campaignVariables,
                extras: { ...senderFor(recipient.sending_account_id), ...ai.extras },
              }),

              scheduled_at: firstSlot,
              provider: recipient.sending_account_id
                ? (accountById.get(recipient.sending_account_id) as never as {
                    provider?: string;
                  } | undefined)?.provider ?? null
                : null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;
        if (messages.length) {
          const { error: mErr } = await context.supabase
            .from("campaign_messages")
            .insert(messages as never);
          if (mErr) throw new Error(mErr.message);
        }
      }
    }


    // Recipients attached before launch (e.g. from the Leads tab) may not have a
    // first message yet — materialise those too so the campaign actually sends.
    const pendingRecipients = await fetchAllRows<{
      id: string;
      lead_id: string;
      sending_account_id: string | null;
    }>(() =>
      context.supabase
        .from("campaign_recipients")
        .select("id, lead_id, sending_account_id")
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .eq("current_step", 0),
    );

    if (pendingRecipients.length) {
      const existingMsgs = await fetchAllRows<{ recipient_id: string | null }>(() =>
        context.supabase
          .from("campaign_messages")
          .select("recipient_id")
          .eq("campaign_id", c.id)
          .eq("step_order", 1),
      );
      const hasMessage = new Set(existingMsgs.map((m) => m.recipient_id));
      const missing = pendingRecipients.filter((r) => !hasMessage.has(r.id));

      if (missing.length) {
        const leadRows = await fetchByIds<{ id: string; email: string }>(
          missing.map((r) => r.lead_id),
          (ids) => context.supabase.from("leads").select(LEAD_FIELDS).in("id", ids),
        );
        const leadById = new Map(leadRows.map((l) => [l.id, l] as const));
        const backfill = missing
          .map((recipient) => {
            const lead = leadById.get(recipient.lead_id);
            if (!lead) return null;
            const ai = aiFor(recipient.lead_id);
            if (ai.hold) {
              heldForAi += 1;
              return null;
            }
            const accountId = recipient.sending_account_id ?? pickAccount();
            return {
              workspace_id: c.workspace_id,
              campaign_id: c.id,
              recipient_id: recipient.id,
              lead_id: recipient.lead_id,
              step_id: firstStep.id,
              sending_account_id: accountId,
              step_order: 1,
              status: "scheduled" as const,
              to_email: lead.email,
              ...renderEmailForLead(firstStep, lead as never, {
                customVariables: campaignVariables,
                extras: {
                  ...senderExtras((accounts ?? []).find((a) => a.id === accountId) as never),
                  ...ai.extras,
                },
              }),

              scheduled_at: firstSlot,
              provider:
                (accounts ?? []).find((a) => a.id === accountId)?.provider ?? null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;

        for (let i = 0; i < backfill.length; i += 500) {
          const { error: bErr } = await context.supabase
            .from("campaign_messages")
            .insert(backfill.slice(i, i + 500) as never);
          if (bErr) throw new Error(bErr.message);
        }
        // Recipients without a mailbox get one assigned on launch.
        for (const recipient of missing.filter((r) => !r.sending_account_id)) {
          await context.supabase
            .from("campaign_recipients")
            .update({ next_send_at: firstSlot })
            .eq("id", recipient.id);
        }
      }
    }

    const { error: uErr } = await context.supabase
      .from("campaigns")
      .update({ status: "active", launched_at: new Date().toISOString() })
      .eq("id", c.id);
    if (uErr) throw new Error(uErr.message);

    // Real queued message count straight from the queue, for the audit trail.
    const { count: scheduledCount } = await context.supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "scheduled");

    const postReadiness = await refreshReadiness(context.supabase, c.id);
    await recordLaunchEvent(context.supabase, {
      readiness: { ...readiness, ...postReadiness, issues: readiness.issues },
      actorId: context.userId,
      outcome: "launched",
      queuedMessages: scheduledCount ?? 0,
      totalRecipients: already.size + fresh.length,
      firstSendAt: firstSlot,
    });

    const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
    await emitTransactionalEvent({
      eventKey: "campaign.launched",
      userId: context.userId,
      workspaceId: c.workspace_id as string,
      idempotencyKey: `campaign.launched:${c.id as string}`,
      variables: {
        "campaign.name": c.name,
        "campaign.recipients": String(already.size + fresh.length),
        "campaign.status": "active",
      },
    });

    return {
      queued: fresh.length,
      total: already.size + fresh.length,
      firstSendAt: firstSlot,
      heldForAi,
    };

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
      const { data: deleted, error: delError } = await context.supabase
        .from("campaigns")
        .delete()
        .in("id", targets)
        .select("id");
      if (delError) throw new Error(delError.message);
      const done = new Set(((deleted ?? []) as Array<{ id: string }>).map((r) => r.id));
      for (const id of targets) {
        if (done.has(id)) succeeded.push(id);
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
