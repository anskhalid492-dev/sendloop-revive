/**
 * Delivery signals (delivered / bounced / complained / unsubscribed).
 *
 * These arrive on the same webhook as replies but must never be turned into
 * conversation messages: they update the outbound message, the lead and the
 * campaign automation instead.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeReportedDeliveryKind } from "@/lib/dsn-parse";

export type DeliveryOutcome = {
  status: "applied" | "unmatched";
  workspaceId?: string | null;
  leadId?: string | null;
  sendingAccountId?: string | null;
  reason?: string;
  failureCode?: string;
};

type Kind = "sent" | "delivered" | "bounced" | "complained" | "unsubscribed" | "delayed" | "failed";

type CampaignMessageRow = {
  id: string;
  status: string | null;
  delivery_status: string | null;
  workspace_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  recipient_id: string | null;
  sending_account_id: string | null;
  to_email: string | null;
};

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
  const kind = normalizeReportedDeliveryKind(args.kind, args.reason);

  if (!args.providerMessageId) {
    const { isWarmupPeerAddress } = await import("@/lib/message-classification.server");
    if (await isWarmupPeerAddress(email)) {
      return { status: "unmatched", reason: "Warmup traffic is tracked separately" };
    }
  }

  const { providerMessageIdCandidates } = await import("@/lib/provider-message-id");
  const ids = providerMessageIdCandidates(args.providerMessageId);
  const { findOutboundMessageByProviderMessageId } = await import("@/lib/outbound-message-resolver.server");
  const resolved = await findOutboundMessageByProviderMessageId({
    providerMessageId: args.providerMessageId,
    email,
    requireType: "campaign",
  });
  const message = (resolved?.row as CampaignMessageRow | null | undefined) ?? null;
  const workspaceId = message?.workspace_id ?? null;
  if (!message || !workspaceId) {
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
    message,
    state: kind,
    detail: args.reason,
    occurredAt: nowIso,
    source: args.source ?? "webhook",
  });

  const { runDeliverabilityGuard } = await import("@/lib/deliverability-guard.server");

  // Soft delays and delivered receipts need no suppression or lead changes.
  if (kind === "sent" || kind === "delivered" || kind === "delayed") {
    if (kind === "delayed") {
      await runDeliverabilityGuard({
        kind: "delayed",
        workspaceId,
        campaignId: message?.campaign_id ?? null,
        sendingAccountId: message?.sending_account_id ?? null,
        leadId: message?.lead_id ?? null,
        email,
        detail: args.reason,
      });
    }
    return {
      status: "applied",
      workspaceId,
      leadId: message?.lead_id ?? null,
      sendingAccountId: message?.sending_account_id ?? null,
    };
  }

  if (kind === "failed") {
    if (message?.campaign_id && message.lead_id) {
      await db
        .from("campaign_recipients")
        .update({ status: "failed", last_error: args.reason })
        .eq("campaign_id", message.campaign_id)
        .eq("lead_id", message.lead_id);
    }
    await runDeliverabilityGuard({
      kind,
      workspaceId,
      campaignId: message?.campaign_id ?? null,
      sendingAccountId: message?.sending_account_id ?? null,
      leadId: message?.lead_id ?? null,
      email,
      detail: args.reason,
    });
    return {
      status: "applied",
      workspaceId,
      leadId: message?.lead_id ?? null,
      sendingAccountId: message?.sending_account_id ?? null,
    };
  }


  // A permanent-rejection bounce (550 5.7.193) is not proof the address is
  // invalid, so it never adds the address to the suppression list.
  if (email && !(kind === "bounced" && isPermanentRejectionBounce(args.reason))) {
    const { suppressEmail } = await import("@/lib/suppression.server");
    await suppressEmail({
      workspaceId,
      email,
      reason: kind === "bounced" ? "bounced" : kind === "complained" ? "complained" : "unsubscribed",
      source: "provider",
      detail: args.reason,
    });
  }

  const leadStatus =
    kind === "bounced" ? "bounced" : kind === "unsubscribed" ? "unsubscribed" : "not_interested";

  const leadId = message?.lead_id ?? null;
  if (leadId) {
    await db.from("leads").update({ status: leadStatus, last_activity_at: nowIso }).eq("id", leadId);
    await db.from("lead_activities").insert({
      lead_id: leadId,
      workspace_id: workspaceId,
      campaign_id: message?.campaign_id ?? null,
      type: kind,
      detail: args.reason ?? `Email ${kind}`,
    });
  }

  // A bounce, complaint or unsubscribe always stops future sending. The reason
  // is persisted on every cancelled message so the bounce/unsubscribe is still
  // counted everywhere instead of disappearing into the Cancelled bucket.
  const cancelledReason =
    kind === "bounced"
      ? "recipient_bounced"
      : kind === "complained"
        ? "recipient_complained"
        : "recipient_unsubscribed";

  if (message?.campaign_id && leadId) {
    await db
      .from("campaign_recipients")
      .update({
        status: kind === "bounced" ? "bounced" : "unsubscribed",
        next_send_at: null,
        last_error: args.reason,
        // Why the bounce happened, kept on the recipient as well as the email.
        ...(kind === "bounced"
          ? { bounce_reason: args.reason?.slice(0, 500) ?? null, bounced_at: nowIso }
          : {}),
      } as never)
      .eq("campaign_id", message.campaign_id)
      .eq("lead_id", leadId);

    await db
      .from("campaign_messages")
      .update({ status: "cancelled", cancelled_reason: cancelledReason } as never)
      .eq("campaign_id", message.campaign_id)
      .eq("lead_id", leadId)
      .in("status", ["pending", "scheduled"]);
  }

  // Also stop every other campaign in the workspace for this address.
  if (email && (kind === "bounced" || kind === "unsubscribed")) {
    await db
      .from("campaign_messages")
      .update({ status: "cancelled", cancelled_reason: cancelledReason } as never)
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
    type: kind,
    title: `${email ?? "A recipient"} ${kind}`,
    message: args.reason,
    entity_type: "lead",
    entity_id: leadId,
  }));
  if (rowsToInsert.length) await db.from("notifications").insert(rowsToInsert);

  // High bounce / complaint rates pause the campaign and mailbox, with reason.
  await runDeliverabilityGuard({
    kind,
    workspaceId,
    campaignId: message?.campaign_id ?? null,
    sendingAccountId: message?.sending_account_id ?? null,
    leadId,
    email,
    detail: args.reason,
  });



  return { status: "applied", workspaceId, leadId, sendingAccountId: message?.sending_account_id ?? null };
}
