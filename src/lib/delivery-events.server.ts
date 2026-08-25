/**
 * Delivery signals (delivered / bounced / complained / unsubscribed).
 *
 * These arrive on the same webhook as replies but must never be turned into
 * conversation messages: they update the outbound message, the lead and the
 * campaign automation instead.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function stripAngle(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/^<|>$/g, "");
}

function idCandidates(value: string | null | undefined): string[] {
  const raw = value?.trim();
  const stripped = stripAngle(raw);
  return Array.from(new Set([raw, stripped].filter(Boolean) as string[]));
}

function inList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;
}

export type DeliveryOutcome = {
  status: "applied" | "unmatched";
  workspaceId?: string | null;
  leadId?: string | null;
  sendingAccountId?: string | null;
  reason?: string;
  failureCode?: string;
};

type Kind = "sent" | "delivered" | "bounced" | "complained" | "unsubscribed" | "delayed" | "failed";

export async function applyDeliveryEvent(args: {
  kind: Kind;
  email: string | null;
  providerMessageId: string | null;
  reason: string | null;
  occurredAt?: string | null;
  source?: "webhook" | "reconcile";
}): Promise<DeliveryOutcome> {
  const db = supabaseAdmin;
  const nowIso = args.occurredAt ?? new Date().toISOString();
  const email = args.email?.toLowerCase() ?? null;

  if (!args.providerMessageId) {
    const { isWarmupPeerAddress } = await import("@/lib/message-classification.server");
    if (await isWarmupPeerAddress(email)) {
      return { status: "unmatched", reason: "Warmup traffic is tracked separately" };
    }
  }

  const columns = "id, status, delivery_status, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, to_email";
  const ids = idCandidates(args.providerMessageId);
  let rows: unknown[] | null = null;
  if (ids.length) {
    const list = inList(ids);
    const { data } = await db
      .from("campaign_messages")
      .select(columns)
      .eq("message_type", "campaign")
      .or(`provider_message_id.in.${list},message_id.in.${list}`)
      .order("sent_at", { ascending: false })
      .limit(1);
    rows = data ?? null;
  } else if (email) {
    const { data } = await db
      .from("campaign_messages")
      .select(columns)
      .eq("message_type", "campaign")
      .eq("to_email", email)
      .order("sent_at", { ascending: false })
      .limit(1);
    rows = data ?? null;
  }
  const message = rows?.[0] ?? null;
  const workspaceId = message?.workspace_id ?? null;
  if (!workspaceId) {
    return {
      status: "unmatched",
      reason: ids.length ? "Provider message ID not found" : "No matching send",
      failureCode: ids.length ? "provider_message_id_not_found" : "campaign_message_not_found",
    };
  }

  // Fold the signal into the message's delivery state (out-of-order safe and
  // idempotent), so campaign metrics always reflect the real provider outcome.
  const { applyDeliveryState } = await import("@/lib/delivery-state.server");
  await applyDeliveryState({
    message: message!,
    state: args.kind,
    detail: args.reason,
    occurredAt: nowIso,
    source: args.source ?? "webhook",
  });

  // Soft delays and delivered receipts need no suppression or lead changes.
  if (args.kind === "sent" || args.kind === "delivered" || args.kind === "delayed") {
    return {
      status: "applied",
      workspaceId,
      leadId: message?.lead_id ?? null,
      sendingAccountId: message?.sending_account_id ?? null,
    };
  }

  if (args.kind === "failed") {
    if (message?.campaign_id && message.lead_id) {
      await db
        .from("campaign_recipients")
        .update({ status: "failed", last_error: args.reason })
        .eq("campaign_id", message.campaign_id)
        .eq("lead_id", message.lead_id);
    }
    return {
      status: "applied",
      workspaceId,
      leadId: message?.lead_id ?? null,
      sendingAccountId: message?.sending_account_id ?? null,
    };
  }

  if (email) {
    const { suppressEmail } = await import("@/lib/suppression.server");
    await suppressEmail({
      workspaceId,
      email,
      reason: args.kind === "bounced" ? "bounced" : args.kind === "complained" ? "complained" : "unsubscribed",
      source: "provider",
      detail: args.reason,
    });
  }

  const leadStatus =
    args.kind === "bounced" ? "bounced" : args.kind === "unsubscribed" ? "unsubscribed" : "not_interested";

  const leadId = message?.lead_id ?? null;
  if (leadId) {
    await db.from("leads").update({ status: leadStatus, last_activity_at: nowIso }).eq("id", leadId);
    await db.from("lead_activities").insert({
      lead_id: leadId,
      workspace_id: workspaceId,
      campaign_id: message?.campaign_id ?? null,
      type: args.kind,
      detail: args.reason ?? `Email ${args.kind}`,
    });
  }

  // A bounce, complaint or unsubscribe always stops future sending.
  if (message?.campaign_id && leadId) {
    await db
      .from("campaign_recipients")
      .update({
        status: args.kind === "bounced" ? "bounced" : "unsubscribed",
        next_send_at: null,
        last_error: args.reason,
      })
      .eq("campaign_id", message.campaign_id)
      .eq("lead_id", leadId);

    await db
      .from("campaign_messages")
      .update({ status: "cancelled" })
      .eq("campaign_id", message.campaign_id)
      .eq("lead_id", leadId)
      .in("status", ["pending", "scheduled"]);
  }

  // Also stop every other campaign in the workspace for this address.
  if (email && (args.kind === "bounced" || args.kind === "unsubscribed")) {
    await db
      .from("campaign_messages")
      .update({ status: "cancelled" })
      .eq("workspace_id", workspaceId)
      .eq("to_email", email)
      .in("status", ["pending", "scheduled"]);
  }

  const { data: members } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const rowsToInsert = (members ?? []).map((m) => ({
    user_id: m.user_id,
    workspace_id: workspaceId,
    type: args.kind,
    title: `${email ?? "A recipient"} ${args.kind}`,
    message: args.reason,
    entity_type: "lead",
    entity_id: leadId,
  }));
  if (rowsToInsert.length) await db.from("notifications").insert(rowsToInsert);

  return { status: "applied", workspaceId, leadId, sendingAccountId: message?.sending_account_id ?? null };
}
