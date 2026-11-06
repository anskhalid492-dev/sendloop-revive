/**
 * Campaign endpoints for the public API.
 *
 * Every query is filtered by `ctx.auth.workspaceId` before anything else — the
 * admin client bypasses RLS, so workspace isolation here is explicit and
 * unconditional. A campaign belonging to another workspace is reported as
 * `campaign_not_found`, never as a permission error, so ids cannot be probed.
 */
import { z } from "zod";

import { ApiError } from "../errors";
import { decodeCursor, paginate, parseLimit } from "../pagination";
import { serializeCampaign, serializeStep } from "../serializers";
import type { ApiContext } from "../runtime.server";
import { parseQuery, parseWith, pathId } from "../validate";
import { resolveActor } from "./actor.server";

const CAMPAIGN_FIELDS =
  "id, workspace_id, name, description, status, tags, list_id, audience_count, eligible_count, emails_sent_count, timezone, send_days, send_start_hour, send_end_hour, start_at, end_at, business_days_only, min_delay_minutes, random_delay_minutes, daily_cap, max_per_hour, email_send_limit, limit_reached_at, sending_account_ids, inbox_rotation_enabled, inbox_rotation_strategy, rotation_daily_cap_per_inbox, open_tracking, click_tracking, unsubscribe_enabled, text_only, stop_on_reply, stop_on_company_reply, launched_at, created_at, updated_at";

const scheduleSchema = z
  .object({
    timezone: z.string().min(1).max(64).optional(),
    send_days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    send_start_hour: z.number().int().min(0).max(23).optional(),
    send_end_hour: z.number().int().min(1).max(24).optional(),
    start_at: z.string().datetime().nullish(),
    end_at: z.string().datetime().nullish(),
    min_delay_minutes: z.number().int().min(0).max(1440).optional(),
    random_delay_minutes: z.number().int().min(0).max(1440).optional(),
  })
  .strict();

const limitsSchema = z
  .object({
    daily_cap: z.number().int().min(0).max(100000).optional(),
    // Enforced ceiling: a mailbox may never be scheduled above 70/hour.
    max_per_hour: z.number().int().min(1).max(70).optional(),
    email_send_limit: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();

const sendingSchema = z
  .object({
    account_ids: z.array(z.string().uuid()).max(200).optional(),
    rotation_enabled: z.boolean().optional(),
    rotation_strategy: z.enum(["round_robin", "least_used", "random"]).optional(),
    rotation_daily_cap_per_inbox: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

const trackingSchema = z
  .object({
    open_tracking: z.boolean().optional(),
    click_tracking: z.boolean().optional(),
    unsubscribe_enabled: z.boolean().optional(),
    text_only: z.boolean().optional(),
  })
  .strict();

const stopSchema = z
  .object({
    stop_on_reply: z.boolean().optional(),
    stop_on_company_reply: z.boolean().optional(),
  })
  .strict();

const campaignWriteSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullish(),
    tags: z.array(z.string().min(1).max(50)).max(25).optional(),
    list_id: z.string().uuid().nullish(),
    schedule: scheduleSchema.optional(),
    limits: limitsSchema.optional(),
    sending: sendingSchema.optional(),
    tracking: trackingSchema.optional(),
    stop_conditions: stopSchema.optional(),
  })
  .strict();

const campaignPatchSchema = campaignWriteSchema.partial().strict();

/** Maps the public shape onto database columns. Unknown keys are impossible. */
function toColumns(input: z.infer<typeof campaignPatchSchema>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out["name"] = input.name;
  if (input.description !== undefined) out["description"] = input.description;
  if (input.tags !== undefined) out["tags"] = input.tags;
  if (input.list_id !== undefined) out["list_id"] = input.list_id;

  const s = input.schedule;
  if (s?.timezone !== undefined) out["timezone"] = s.timezone;
  if (s?.send_days !== undefined) out["send_days"] = s.send_days;
  if (s?.send_start_hour !== undefined) out["send_start_hour"] = s.send_start_hour;
  if (s?.send_end_hour !== undefined) out["send_end_hour"] = s.send_end_hour;
  if (s?.start_at !== undefined) out["start_at"] = s.start_at;
  if (s?.end_at !== undefined) out["end_at"] = s.end_at;
  if (s?.min_delay_minutes !== undefined) out["min_delay_minutes"] = s.min_delay_minutes;
  if (s?.random_delay_minutes !== undefined) out["random_delay_minutes"] = s.random_delay_minutes;

  const l = input.limits;
  if (l?.daily_cap !== undefined) out["daily_cap"] = l.daily_cap;
  if (l?.max_per_hour !== undefined) out["max_per_hour"] = l.max_per_hour;
  if (l?.email_send_limit !== undefined) out["email_send_limit"] = l.email_send_limit;

  const sd = input.sending;
  if (sd?.account_ids !== undefined) out["sending_account_ids"] = sd.account_ids;
  if (sd?.rotation_enabled !== undefined) out["inbox_rotation_enabled"] = sd.rotation_enabled;
  if (sd?.rotation_strategy !== undefined) out["inbox_rotation_strategy"] = sd.rotation_strategy;
  if (sd?.rotation_daily_cap_per_inbox !== undefined)
    out["rotation_daily_cap_per_inbox"] = sd.rotation_daily_cap_per_inbox;

  const t = input.tracking;
  if (t?.open_tracking !== undefined) out["open_tracking"] = t.open_tracking;
  if (t?.click_tracking !== undefined) out["click_tracking"] = t.click_tracking;
  if (t?.unsubscribe_enabled !== undefined) out["unsubscribe_enabled"] = t.unsubscribe_enabled;
  if (t?.text_only !== undefined) out["text_only"] = t.text_only;

  const st = input.stop_conditions;
  if (st?.stop_on_reply !== undefined) out["stop_on_reply"] = st.stop_on_reply;
  if (st?.stop_on_company_reply !== undefined)
    out["stop_on_company_reply"] = st.stop_on_company_reply;

  return out;
}

/** Loads a campaign that provably belongs to the caller's workspace. */
export async function loadCampaign(ctx: ApiContext, id: string) {
  const { data, error } = await ctx.admin
    .from("campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .maybeSingle();
  if (error) throw new ApiError("internal_error", "Could not read the campaign.");
  if (!data) throw new ApiError("campaign_not_found", "No campaign with that id exists.");
  return data;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

const listQuerySchema = z
  .object({
    limit: z.string().optional(),
    cursor: z.string().optional(),
    status: z.string().optional(),
    search: z.string().max(200).optional(),
    list_id: z.string().uuid().optional(),
  })
  .passthrough();

const STATUSES = ["draft", "scheduled", "active", "paused", "completed", "archived"] as const;

export async function listCampaigns(ctx: ApiContext) {
  const q = parseQuery(listQuerySchema, ctx.url);
  const limit = parseLimit(q.limit ?? null);

  let query = ctx.admin
    .from("campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("workspace_id", ctx.auth.workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (q.status) {
    const statuses = q.status.split(",").map((s) => s.trim());
    for (const status of statuses) {
      if (!(STATUSES as readonly string[]).includes(status)) {
        throw new ApiError("invalid_request", `Unknown status \`${status}\`.`, {
          details: { allowed: STATUSES },
        });
      }
    }
    query = query.in("status", statuses);
  }
  if (q.list_id) query = query.eq("list_id", q.list_id);
  if (q.search) query = query.ilike("name", `%${q.search.replace(/[%_]/g, "")}%`);
  if (q.cursor) {
    const cursor = decodeCursor(q.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not list campaigns.");

  const page = paginate(data ?? [], limit, (row: { created_at: string; id: string }) => ({
    createdAt: row.created_at,
    id: row.id,
  }));
  return { object: "list", ...page, data: page.data.map(serializeCampaign) };
}

export async function createCampaign(ctx: ApiContext) {
  const input = parseWith(campaignWriteSchema, ctx.body);
  const actor = await resolveActor(ctx.admin, ctx.auth.workspaceId, ctx.auth.createdBy);

  const { requireEntitlement } = await import("@/lib/billing/usage.server");
  await requireEntitlement(ctx.auth.workspaceId, "campaigns");

  const { data, error } = await ctx.admin
    .from("campaigns")
    .insert({
      ...toColumns(input),
      workspace_id: ctx.auth.workspaceId,
      created_by: actor,
      status: "draft",
    })
    .select(CAMPAIGN_FIELDS)
    .single();
  if (error) throw new ApiError("invalid_request", "The campaign could not be created.", {
    details: { reason: error.message },
  });
  return { data: serializeCampaign(data) };
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export async function getCampaign(ctx: ApiContext) {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  return { data: serializeCampaign(await loadCampaign(ctx, id)) };
}

export async function updateCampaign(ctx: ApiContext) {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  await loadCampaign(ctx, id);
  const patch = toColumns(parseWith(campaignPatchSchema, ctx.body));
  if (Object.keys(patch).length === 0) {
    throw new ApiError("invalid_request", "Provide at least one field to update.");
  }

  const { data, error } = await ctx.admin
    .from("campaigns")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .select(CAMPAIGN_FIELDS)
    .single();
  if (error) throw new ApiError("invalid_request", "The campaign could not be updated.", {
    details: { reason: error.message },
  });

  // Schedule fields drive the queue, so realign pending messages immediately
  // instead of waiting for the next dispatch tick.
  const touchedSchedule = ["timezone", "send_days", "send_start_hour", "send_end_hour"].some(
    (key) => key in patch,
  );
  if (touchedSchedule && data.status === "active") {
    const { rescheduleCampaignQueue } = await import("@/lib/campaign-reschedule.server");
    await rescheduleCampaignQueue(ctx.admin, id).catch((err: unknown) => {
      console.warn(`[api/v1][${ctx.requestId}] reschedule after update failed`, err);
    });
  }

  return { data: serializeCampaign(data) };
}

export async function deleteCampaign(ctx: ApiContext) {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  await loadCampaign(ctx, id);
  const { error } = await ctx.admin
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId);
  if (error) throw new ApiError("conflict", "The campaign could not be deleted.");
  return { data: { id, object: "campaign", deleted: true } };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function campaignAction(ctx: ApiContext, action: "launch" | "pause" | "resume" | "stop") {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  const campaign = await loadCampaign(ctx, id);

  if (action === "launch") {
    if (campaign.status === "active") {
      throw new ApiError("conflict", "This campaign is already running.");
    }
    const actor = await resolveActor(ctx.admin, ctx.auth.workspaceId, ctx.auth.createdBy);
    const { launchCampaignService } = await import("@/lib/campaign-actions.server");
    try {
      const result = await launchCampaignService(ctx.admin, actor, id);
      return { data: { ...result, campaign_id: id, action } };
    } catch (thrown) {
      // Launch failures are user-actionable (no mailbox, empty list, plan limit).
      throw new ApiError(
        "conflict",
        thrown instanceof Error ? thrown.message : "The campaign could not be launched.",
      );
    }
  }

  const nextStatus = action === "pause" ? "paused" : action === "resume" ? "active" : "completed";

  if (action === "resume") {
    if (campaign.status === "draft") {
      throw new ApiError("conflict", "Launch this campaign before resuming it.");
    }
    const { requireEntitlement, checkUsageLimit } = await import("@/lib/billing/usage.server");
    await requireEntitlement(ctx.auth.workspaceId, "campaigns");
    if (campaign.status !== "active") {
      await checkUsageLimit(ctx.auth.workspaceId, "active_campaigns", 1);
    }
  }
  if (action === "pause" && campaign.status === "draft") {
    throw new ApiError("conflict", "Draft campaigns cannot be paused.");
  }

  const { data, error } = await ctx.admin
    .from("campaigns")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .select(CAMPAIGN_FIELDS)
    .single();
  if (error) throw new ApiError("conflict", "The campaign status could not be changed.");

  if (action === "stop") {
    // Stopping must also clear the queue, otherwise scheduled mail still goes out.
    await ctx.admin
      .from("campaign_messages")
      .update({ status: "cancelled", cancelled_reason: "sequence_stopped" } as never)
      .eq("campaign_id", id)
      .eq("workspace_id", ctx.auth.workspaceId)
      .in("status", ["pending", "scheduled"]);
  }

  return { data: serializeCampaign(data), action };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function campaignStats(ctx: ApiContext) {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  const campaign = await loadCampaign(ctx, id);

  const { fetchOneCampaignStats } = await import("@/lib/campaign-stats.server");
  const { stats } = await fetchOneCampaignStats(ctx.admin, ctx.auth.workspaceId, id);
  const { openRatePercent, clickRatePercent, replyRatePercent, bounceRatePercent, unsubscribeRatePercent } = await import("@/lib/engagement-rates");
  const people = { contacted: stats.contacted, bounced: stats.bounced };
  return { data: {
    object: "campaign_stats", campaign_id: id, status: campaign.status, recipients: stats.leads,
    totals: { sent: stats.sent, accepted: stats.accepted, delivered: stats.delivered, scheduled: stats.scheduled, sending: stats.sending,
      failed: stats.failed, held: stats.held, attempted: stats.attempted, cancelled: stats.cancelled,
      bounced: stats.bounced, opened: stats.opened, clicked: stats.clicked, replied: stats.replied, unsubscribed: stats.unsubscribed },
    current_outcomes: stats.currentOutcomes,
    rates: { open_rate: openRatePercent(stats.opened, people), click_rate: clickRatePercent(stats.clicked, people),
      reply_rate: replyRatePercent(stats.replied, people), bounce_rate: bounceRatePercent(stats.bounced, stats.sent),
      unsubscribe_rate: unsubscribeRatePercent(stats.unsubscribed, people) },
  } };
}

// ---------------------------------------------------------------------------
// Sequence steps
// ---------------------------------------------------------------------------

const stepSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    subject: z.string().max(500).optional(),
    body: z.string().max(200000).optional(),
    step_order: z.number().int().min(1).max(50).optional(),
    step_type: z.enum(["email", "wait"]).optional(),
    wait_days: z.number().int().min(0).max(365).optional(),
    wait_hours: z.number().int().min(0).max(23).optional(),
    same_thread: z.boolean().optional(),
  })
  .strict();

export async function listSteps(ctx: ApiContext) {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  await loadCampaign(ctx, id);
  const { data, error } = await ctx.admin
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .order("step_order", { ascending: true });
  if (error) throw new ApiError("internal_error", "Could not read the sequence.");
  return { object: "list", data: (data ?? []).map(serializeStep) };
}

export async function createStep(ctx: ApiContext) {
  const id = pathId(ctx.params["campaignId"], "campaign id");
  await loadCampaign(ctx, id);
  const input = parseWith(stepSchema.required({ subject: true, body: true }), ctx.body);

  const { data: existing } = await ctx.admin
    .from("campaign_steps")
    .select("step_order")
    .eq("campaign_id", id)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = input.step_order ?? ((existing?.step_order as number | undefined) ?? 0) + 1;

  const { data, error } = await ctx.admin
    .from("campaign_steps")
    .insert({
      workspace_id: ctx.auth.workspaceId,
      campaign_id: id,
      name: input.name ?? `Step ${nextOrder}`,
      subject: input.subject,
      body: input.body,
      step_order: nextOrder,
      step_type: input.step_type ?? "email",
      wait_days: input.wait_days ?? 0,
      wait_hours: input.wait_hours ?? 0,
      same_thread: input.same_thread ?? true,
    })
    .select("*")
    .single();
  if (error) throw new ApiError("invalid_request", "The step could not be created.", {
    details: { reason: error.message },
  });
  return { data: serializeStep(data) };
}

export async function updateStep(ctx: ApiContext) {
  const campaignId = pathId(ctx.params["campaignId"], "campaign id");
  const stepId = pathId(ctx.params["stepId"], "step id");
  await loadCampaign(ctx, campaignId);
  const input = parseWith(stepSchema, ctx.body);
  if (Object.keys(input).length === 0) {
    throw new ApiError("invalid_request", "Provide at least one field to update.");
  }

  const { data, error } = await ctx.admin
    .from("campaign_steps")
    .update(input)
    .eq("id", stepId)
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.auth.workspaceId)
    .select("*")
    .maybeSingle();
  if (error) throw new ApiError("invalid_request", "The step could not be updated.");
  if (!data) throw new ApiError("not_found", "No sequence step with that id exists.");
  return { data: serializeStep(data) };
}

export async function deleteStep(ctx: ApiContext) {
  const campaignId = pathId(ctx.params["campaignId"], "campaign id");
  const stepId = pathId(ctx.params["stepId"], "step id");
  await loadCampaign(ctx, campaignId);
  const { data, error } = await ctx.admin
    .from("campaign_steps")
    .delete()
    .eq("id", stepId)
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.auth.workspaceId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("conflict", "The step could not be deleted.");
  if (!data) throw new ApiError("not_found", "No sequence step with that id exists.");
  return { data: { id: stepId, object: "sequence_step", deleted: true } };
}
