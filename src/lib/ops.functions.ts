/**
 * Admin-only operational endpoints: inbound readiness, the campaign
 * scheduler and the email event log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getInboundChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ baseUrl: z.string().url().max(300).nullish() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getInboundReadiness } = await import("@/lib/ops.server");
    return getInboundReadiness(data.baseUrl ?? null);
  });

export const enableReceiving = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { enableInboundReceiving } = await import("@/lib/ops.server");
    return enableInboundReceiving();
  });

export const getScheduler = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getSchedulerStatus } = await import("@/lib/ops.server");
    return getSchedulerStatus();
  });

export const setScheduler = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ baseUrl: z.string().url().max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { configureScheduler } = await import("@/lib/ops.server");
    return configureScheduler(data.baseUrl);
  });

export const listEmailEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["all", "pending", "processed", "failed", "retrying", "ignored"]).default("all"),
        eventType: z.string().trim().max(40).default("all"),
        signature: z.enum(["all", "valid", "invalid", "missing", "failed", "unverified"]).default("all"),
        tokenStatus: z.enum(["all", "matched", "invalid", "none", "unmatched"]).default("all"),
        from: z.string().trim().max(40).optional(),
        to: z.string().trim().max(40).optional(),
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(10).max(1000).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let query = context.supabase
      .from("email_events")
      .select(
        "id, provider, event_type, external_id, status, attempts, duplicate_count, signature_status, signature_detail, routing_token, token_status, failure_code, last_retry_at, error, from_email, to_email, subject, message_id, workspace_id, sending_account_id, lead_id, conversation_id, created_at, processed_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.eventType !== "all") query = query.eq("event_type", data.eventType);
    if (data.signature !== "all") query = query.eq("signature_status", data.signature);
    if (data.tokenStatus !== "all") query = query.eq("token_status", data.tokenStatus);
    if (data.from) query = query.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const end = new Date(data.to);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }
    if (data.search) {
      const term = `%${data.search}%`;
      query = query.or(
        `from_email.ilike.${term},to_email.ilike.${term},subject.ilike.${term},message_id.ilike.${term},routing_token.ilike.${term},external_id.ilike.${term}`,
      );
    }
    const { data: events, error } = await query;
    if (error) throw new Error(error.message);
    return { events: events ?? [] };
  });

export const getInboundOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getInboundOpsSettings, getLastAlert } = await import("@/lib/inbound-ops.server");
    return { settings: await getInboundOpsSettings(), lastAlert: await getLastAlert() };
  });

export const saveInboundOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        maxRetries: z.number().int().min(0).max(20),
        backoffMinutes: z.number().int().min(1).max(1440),
        backoffFactor: z.number().min(1).max(5),
        retryEnabled: z.boolean(),
        notifyEmail: z.string().email().max(320).nullable(),
        notifyWebhookUrl: z.string().url().max(500).nullable(),
        notifyOnSignatureFailure: z.boolean(),
        notifyOnRetryThreshold: z.boolean(),
        retryAlertThreshold: z.number().int().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveInboundOpsSettings } = await import("@/lib/inbound-ops.server");
    return saveInboundOpsSettings(data);
  });

export const runRetrySweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runInboundRetrySweep } = await import("@/lib/inbound-ops.server");
    return runInboundRetrySweep();
  });

export const getInboundEventDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getEventDetail } = await import("@/lib/inbound-ops.server");
    return getEventDetail(data.id);
  });

export const runReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { reconcileInboundEvents } = await import("@/lib/inbound-ops.server");
    return reconcileInboundEvents();
  });

export const repairEventConversationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { repairEventLink } = await import("@/lib/inbound-ops.server");
    return repairEventLink(data.id);
  });


export const retryEmailEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { retryStoredEvent } = await import("@/lib/email-events.server");
    return retryStoredEvent(data.id, false, {
      userId: context.userId,
      email: (context.claims as { email?: string } | null)?.email ?? null,
    });
  });

/** Who retried or reprocessed an event, and what changed each time. */
export const listEventActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("inbound_event_actions")
      .select(
        "id, action, actor_id, actor_email, previous_status, result_status, outcome, conversation_id, detail, created_at",
      )
      .eq("event_id", data.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const startInboundTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ toEmail: z.string().email().max(320) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runInboundTest } = await import("@/lib/ops.server");
    return runInboundTest({ userId: context.userId, toEmail: data.toEmail.toLowerCase() });
  });

export const getInboundTests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listInboundTests } = await import("@/lib/ops.server");
    return listInboundTests();
  });

export const reprocessEmailEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { reprocessStoredEvent } = await import("@/lib/email-events.server");
    return reprocessStoredEvent(data.id, {
      userId: context.userId,
      email: (context.claims as { email?: string } | null)?.email ?? null,
    });
  });

export const getRoutingFailures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listRoutingFailures } = await import("@/lib/ops.server");
    return listRoutingFailures(50);
  });

export const getWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getWebhookVerificationStatus } = await import("@/lib/ops.server");
    return getWebhookVerificationStatus();
  });

export const checkMx = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { checkMxRecords } = await import("@/lib/ops.server");
    return checkMxRecords();
  });

export const listAdminNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["all", "signature_failure", "retry_threshold", "retry_exhausted"]).default("all"),
        channel: z.enum(["all", "email", "webhook"]).default("all"),
        status: z.enum(["all", "sent", "failed", "skipped"]).default("all"),
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(10).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let query = context.supabase
      .from("admin_notifications")
      .select(
        "id, kind, title, channel, destination, status, error, response_code, duration_ms, detail, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind !== "all") query = query.eq("kind", data.kind);
    if (data.channel !== "all") query = query.eq("channel", data.channel);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.search) {
      const term = `%${data.search}%`;
      query = query.or(`title.ilike.${term},destination.ilike.${term},error.ilike.${term}`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listUnmatchedEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listUnmatchedInbound } = await import("@/lib/unmatched-inbound.server");
    return listUnmatchedInbound(50);
  });

export const retryUnmatchedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { retryUnmatchedInbound } = await import("@/lib/unmatched-inbound.server");
    return retryUnmatchedInbound(data.id);
  });
