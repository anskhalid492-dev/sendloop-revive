/**
 * Webhook event log + processing pipeline.
 *
 * Every inbound delivery is recorded before it is processed, so a provider
 * retry can never create a second conversation, message or notification, and
 * a failure is retryable from the admin log instead of being lost.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  classifyEvent,
  externalIdOf,
  extractEmail,
  inboundPayloadSchema,
  normalizeDelivery,
  normalizeInbound,
} from "@/lib/inbound-parse";

export type ProcessResult = {
  status: "created" | "duplicate" | "unmatched" | "applied" | "ignored" | "failed";
  eventId?: string;
  conversationId?: string | undefined;
  reason?: string | undefined;
};

/** Records the raw event; reports a duplicate delivery instead of inserting twice. */
async function recordEvent(args: {
  provider: string;
  kind: string;
  externalId: string | null;
  payload: Record<string, unknown>;
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  messageId: string | null;
  signatureStatus: string;
  signatureDetail: string | null;
  routingToken: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("email_events")
    .insert({
      provider: args.provider,
      event_type: args.kind,
      external_id: args.externalId,
      payload: args.payload as never,
      from_email: args.fromEmail,
      to_email: args.toEmail,
      subject: args.subject,
      message_id: args.messageId,
      status: "pending",
      signature_status: args.signatureStatus,
      signature_detail: args.signatureDetail,
      routing_token: args.routingToken,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && args.externalId) {
      // Idempotency hit: count the redelivery on the original row.
      const { data: original } = await supabaseAdmin
        .from("email_events")
        .select("id, duplicate_count")
        .eq("external_id", args.externalId)
        .maybeSingle();
      if (original) {
        await supabaseAdmin
          .from("email_events")
          .update({ duplicate_count: (original.duplicate_count ?? 0) + 1 })
          .eq("id", original.id);
      }
      return { duplicate: true as const, id: original?.id ?? null };
    }
    if (error.code === "23505") return { duplicate: true as const, id: null };
    throw new Error(error.message);
  }
  return { duplicate: false as const, id: data.id };
}


async function finish(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("email_events")
    .update({ ...patch, processed_at: new Date().toISOString() })
    .eq("id", id);
}

/** Runs one stored payload through the right processor. */
export async function processEventPayload(
  eventId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  try {
    if (kind === "inbound") {
      const normalized = normalizeInbound(payload);
      if (!normalized) {
        await finish(eventId, { status: "failed", error: "Payload has no sender or recipient" });
        return { status: "failed", eventId, reason: "Invalid payload" };
      }
      const parsed = inboundPayloadSchema.parse(normalized);
      const references = Array.isArray(parsed.references)
        ? parsed.references
        : (parsed.references ?? "").split(/\s+/).filter(Boolean);

      const { ingestInboundEmail } = await import("@/lib/inbox.server");
      const result = await ingestInboundEmail({
        from: extractEmail(parsed.from),
        fromName: parsed.fromName ?? null,
        to: extractEmail(parsed.to),
        cc: (parsed.cc ?? []).map(extractEmail),
        subject: parsed.subject ?? null,
        text: parsed.text ?? null,
        html: parsed.html ?? null,
        messageId: parsed.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        references,
        receivedAt: parsed.receivedAt ?? null,
        attachments: parsed.attachments ?? [],
      });

      // Routing diagnostics: did the reply carry a token, and did it resolve?
      const toAddress = extractEmail(parsed.to);
      const { tokenFromAddress, resolveRouteFromAddress } = await import(
        "@/lib/inbound-routing.server"
      );
      const token = tokenFromAddress(toAddress);
      const route = token ? await resolveRouteFromAddress(toAddress) : null;
      const tokenStatus = !token ? "none" : route ? "matched" : "invalid";
      const failureCode =
        result.status === "unmatched"
          ? tokenStatus === "invalid"
            ? "invalid_token"
            : tokenStatus === "none"
              ? "no_token"
              : "unmatched_thread"
          : null;

      await finish(eventId, {
        status: result.status === "unmatched" ? "failed" : "processed",
        error: result.reason ?? null,
        conversation_id: result.conversationId ?? null,
        routing_token: token,
        token_status: result.status === "unmatched" && tokenStatus === "matched" ? "unmatched" : tokenStatus,
        failure_code: failureCode,
      });
      return { status: result.status, eventId, conversationId: result.conversationId };

    }

    if (kind === "delivered" || kind === "bounced" || kind === "complained" || kind === "unsubscribed") {
      const { applyDeliveryEvent } = await import("@/lib/delivery-events.server");
      const delivery = normalizeDelivery(payload);

      // Warmup traffic is tracked separately from campaign traffic. The warmup
      // handler is idempotent and claims the event only when the provider
      // message id belongs to a warmup job.
      if (kind !== "unsubscribed") {
        const { applyWarmupDeliveryEvent } = await import("@/lib/warmup-engine.server");
        const claimed = await applyWarmupDeliveryEvent({
          kind,
          providerMessageId: delivery.providerMessageId,
          email: delivery.email,
          reason: delivery.reason,
          externalId: `warmup:${kind}:${delivery.providerMessageId ?? ""}:${externalIdOf(payload, kind) ?? ""}`,
          payload,
        });
        if (claimed) {
          await finish(eventId, { status: "processed", error: null });
          return { status: "applied", eventId };
        }
      }

      const outcome = await applyDeliveryEvent({
        kind,
        email: delivery.email,
        providerMessageId: delivery.providerMessageId,
        reason: delivery.reason,
      });

      await finish(eventId, {
        status: outcome.status === "applied" ? "processed" : "failed",
        error: outcome.reason ?? null,
        workspace_id: outcome.workspaceId ?? null,
        lead_id: outcome.leadId ?? null,
      });
      return { status: outcome.status === "applied" ? "applied" : "unmatched", eventId };
    }

    await finish(eventId, { status: "ignored", error: null });
    return { status: "ignored", eventId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await supabaseAdmin
      .from("email_events")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", eventId);
    return { status: "failed", eventId, reason: message };
  }
}

/** Entry point used by the inbound webhook route. */
export async function handleWebhookDelivery(
  raw: Record<string, unknown>,
  provider = "resend",
  meta?: { signatureStatus?: string; signatureDetail?: string | null },
): Promise<ProcessResult> {
  const kind = classifyEvent(raw);
  const externalId = externalIdOf(raw, kind);
  const source =
    raw["data"] && typeof raw["data"] === "object" ? (raw["data"] as Record<string, unknown>) : raw;

  const toEmail = Array.isArray(source["to"])
    ? String(source["to"][0]).slice(0, 320)
    : typeof source["to"] === "string"
      ? source["to"].slice(0, 320)
      : null;
  const { tokenFromAddress } = await import("@/lib/inbound-routing.server");

  const recorded = await recordEvent({
    provider,
    kind,
    externalId,
    payload: raw,
    fromEmail: typeof source["from"] === "string" ? source["from"].slice(0, 320) : null,
    toEmail,
    subject: typeof source["subject"] === "string" ? source["subject"].slice(0, 300) : null,
    messageId: externalId,
    signatureStatus: meta?.signatureStatus ?? "unverified",
    signatureDetail: meta?.signatureDetail ?? null,
    routingToken: toEmail ? tokenFromAddress(toEmail) : null,
  });
  if (recorded.duplicate) return { status: "duplicate", ...(recorded.id ? { eventId: recorded.id } : {}) };

  return processEventPayload(recorded.id, kind, raw);
}

export type EventActor = { userId: string; email?: string | null } | null;

/** Classifies a manual re-run so the audit log reads plainly. */
function outcomeOf(result: ProcessResult): "success" | "still_failing" | "ignored_duplicate" {
  if (result.status === "failed" || result.status === "unmatched") return "still_failing";
  if (result.status === "duplicate" || result.status === "ignored") return "ignored_duplicate";
  return "success";
}

/** Re-runs a stored event from the admin log. */
export async function retryStoredEvent(
  id: string,
  force = false,
  actor: EventActor = null,
  action: "retry" | "reprocess" | "auto_retry" = "retry",
): Promise<ProcessResult> {
  const { data, error } = await supabaseAdmin
    .from("email_events")
    .select("id, event_type, payload, attempts, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Event not found");
  if (!force && data.status === "processed") {
    throw new Error("This event already processed successfully — use Reprocess to force a re-run.");
  }

  await supabaseAdmin
    .from("email_events")
    .update({
      status: "retrying",
      attempts: (data.attempts ?? 0) + 1,
      error: null,
      failure_code: null,
      last_retry_at: new Date().toISOString(),
    })
    .eq("id", id);

  const result = await processEventPayload(
    id,
    data.event_type,
    (data.payload ?? {}) as Record<string, unknown>,
  );

  await recordEventAction({
    eventId: id,
    actor,
    action,
    previousStatus: data.status,
    result,
  });

  return result;
}

/** Writes one row of the who-did-what audit trail for manual re-runs. */
export async function recordEventAction(args: {
  eventId: string;
  actor: EventActor;
  action: "retry" | "reprocess" | "auto_retry";
  previousStatus: string | null;
  result: ProcessResult;
}) {
  await supabaseAdmin.from("inbound_event_actions").insert({
    event_id: args.eventId,
    actor_id: args.actor?.userId ?? null,
    actor_email: args.actor?.email ?? (args.action === "auto_retry" ? "system (auto retry)" : null),
    action: args.action,
    previous_status: args.previousStatus,
    result_status: args.result.status,
    outcome: outcomeOf(args.result),
    conversation_id: args.result.conversationId ?? null,
    detail: args.result.reason ? args.result.reason.slice(0, 500) : null,
  });
}

/**
 * Forces a stored event through the pipeline again, even when it already
 * succeeded. Safe because every processor is idempotent: an existing
 * conversation, message or suppression is reused rather than duplicated.
 */
export async function reprocessStoredEvent(id: string, actor: EventActor = null): Promise<ProcessResult> {
  return retryStoredEvent(id, true, actor, "reprocess");
}


