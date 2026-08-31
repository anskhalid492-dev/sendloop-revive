/**
 * Bounce and complaint protection.
 *
 * Sits on top of the existing delivery-event pipeline: suppression, lead
 * status and campaign stops are already handled in `delivery-events.server.ts`.
 * This module adds the two protective reactions that were missing:
 *
 * - repeated temporary failures for one address flag/restrict that contact,
 * - an abnormally high bounce or complaint rate pauses the affected campaign
 *   and/or mailbox, always with a human-readable reason.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Rolling window used for every rate calculation. */
export const GUARD_WINDOW_HOURS = 24;
/** Below this many sends the sample is too small to act on. */
export const GUARD_MIN_SAMPLE = 20;
export const GUARD_MAX_BOUNCE_RATE = 8; // percent
export const GUARD_MAX_COMPLAINT_RATE = 0.5; // percent
/** Soft failures for one address before the contact is restricted. */
export const SOFT_FAILURE_LIMIT = 3;

export type GuardRates = {
  sent: number;
  bounced: number;
  complained: number;
  bounceRate: number;
  complaintRate: number;
  sampleSufficient: boolean;
};

export function computeRates(rows: Array<{ delivery_status: string | null }>): GuardRates {
  const sent = rows.length;
  const bounced = rows.filter((r) => r.delivery_status === "bounced").length;
  const complained = rows.filter((r) => r.delivery_status === "complained").length;
  const pct = (n: number) => (sent ? Math.round((n / sent) * 1000) / 10 : 0);
  return {
    sent,
    bounced,
    complained,
    bounceRate: pct(bounced),
    complaintRate: pct(complained),
    sampleSufficient: sent >= GUARD_MIN_SAMPLE,
  };
}

/** Returns the pause reason when the numbers breach a threshold, else null. */
export function guardViolation(rates: GuardRates, subject: "campaign" | "mailbox"): string | null {
  if (!rates.sampleSufficient) return null;
  const scope = subject === "campaign" ? "This campaign" : "This mailbox";
  if (rates.complaintRate > GUARD_MAX_COMPLAINT_RATE) {
    return `${scope} was paused automatically: spam complaint rate ${rates.complaintRate}% over the last ${rates.sent} sends exceeded the ${GUARD_MAX_COMPLAINT_RATE}% limit.`;
  }
  if (rates.bounceRate > GUARD_MAX_BOUNCE_RATE) {
    return `${scope} was paused automatically: bounce rate ${rates.bounceRate}% over the last ${rates.sent} sends exceeded the ${GUARD_MAX_BOUNCE_RATE}% limit.`;
  }
  return null;
}

function windowStart(): string {
  return new Date(Date.now() - GUARD_WINDOW_HOURS * 3600_000).toISOString();
}

async function notifyWorkspace(workspaceId: string, title: string, message: string) {
  const { data: members } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const rows = (members ?? []).map((m) => ({
    user_id: m.user_id,
    workspace_id: workspaceId,
    type: "paused",
    title,
    message,
  }));
  if (rows.length) await supabaseAdmin.from("notifications").insert(rows as never);
}

/**
 * Repeated soft failures (delays / temporary errors) for one address restrict
 * that contact through the existing suppression list, so no future campaign
 * email can reach it.
 */
export async function flagRepeatedSoftFailures(args: {
  workspaceId: string;
  email: string | null;
  leadId: string | null;
  detail?: string | null;
}) {
  const email = args.email?.trim().toLowerCase();
  if (!email) return { flagged: false, count: 0 };

  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("id, delivery_status")
    .eq("workspace_id", args.workspaceId)
    .eq("to_email", email)
    .gte("last_event_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString())
    .in("delivery_status", ["delayed", "failed"]);
  if (error) return { flagged: false, count: 0 };

  const count = data?.length ?? 0;
  if (count < SOFT_FAILURE_LIMIT) return { flagged: false, count };

  const reason = `Repeated temporary delivery failures (${count} in the last 30 days)`;
  const { suppressEmail } = await import("@/lib/suppression.server");
  await suppressEmail({
    workspaceId: args.workspaceId,
    email,
    reason: "manual",
    source: "deliverability-guard",
    detail: reason,
  });
  if (args.leadId) {
    await supabaseAdmin.from("leads").update({ status: "paused" }).eq("id", args.leadId);
    await supabaseAdmin.from("lead_activities").insert({
      lead_id: args.leadId,
      workspace_id: args.workspaceId,
      type: "restricted",
      detail: reason,
    } as never);
  }
  return { flagged: true, count };
}

/** Pauses a campaign whose recent bounce/complaint rate is abnormally high. */
export async function evaluateCampaignHealth(args: { workspaceId: string; campaignId: string }) {
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, status")
    .eq("id", args.campaignId)
    .maybeSingle();
  if (!campaign || campaign.status !== "active") return { paused: false as const };

  const { data: rows } = await supabaseAdmin
    .from("campaign_messages")
    .select("delivery_status")
    .eq("campaign_id", args.campaignId)
    .not("sent_at", "is", null)
    .gte("sent_at", windowStart())
    .limit(1000);

  const rates = computeRates((rows ?? []) as Array<{ delivery_status: string | null }>);
  const reason = guardViolation(rates, "campaign");
  if (!reason) return { paused: false as const, rates };

  await supabaseAdmin
    .from("campaigns")
    .update({ status: "paused", pause_reason: reason, paused_at: new Date().toISOString() } as never)
    .eq("id", args.campaignId);
  await notifyWorkspace(args.workspaceId, `Campaign paused: ${campaign.name}`, reason);
  return { paused: true as const, reason, rates };
}

/** Pauses a mailbox whose recent bounce/complaint rate is abnormally high. */
export async function evaluateMailboxHealth(args: {
  workspaceId: string;
  sendingAccountId: string;
}) {
  const { data: account } = await supabaseAdmin
    .from("sending_accounts")
    .select("id, from_email, paused")
    .eq("id", args.sendingAccountId)
    .maybeSingle();
  if (!account || account.paused) return { paused: false as const };

  const { data: rows } = await supabaseAdmin
    .from("campaign_messages")
    .select("delivery_status")
    .eq("sending_account_id", args.sendingAccountId)
    .not("sent_at", "is", null)
    .gte("sent_at", windowStart())
    .limit(1000);

  const rates = computeRates((rows ?? []) as Array<{ delivery_status: string | null }>);
  const reason = guardViolation(rates, "mailbox");
  if (!reason) return { paused: false as const, rates };

  await supabaseAdmin
    .from("sending_accounts")
    .update({
      paused: true,
      pause_reason: reason,
      paused_at: new Date().toISOString(),
      last_error: reason,
    } as never)
    .eq("id", args.sendingAccountId);
  await notifyWorkspace(args.workspaceId, `Mailbox paused: ${account.from_email}`, reason);
  return { paused: true as const, reason, rates };
}

/** Entry point called from the delivery-event pipeline. */
export async function runDeliverabilityGuard(args: {
  kind: string;
  workspaceId: string;
  campaignId: string | null;
  sendingAccountId: string | null;
  leadId: string | null;
  email: string | null;
  detail?: string | null;
}) {
  try {
    if (args.kind === "delayed" || args.kind === "failed") {
      await flagRepeatedSoftFailures({
        workspaceId: args.workspaceId,
        email: args.email,
        leadId: args.leadId,
        detail: args.detail ?? null,
      });
      return;
    }
    if (args.kind !== "bounced" && args.kind !== "complained") return;
    if (args.campaignId) {
      await evaluateCampaignHealth({ workspaceId: args.workspaceId, campaignId: args.campaignId });
    }
    if (args.sendingAccountId) {
      await evaluateMailboxHealth({
        workspaceId: args.workspaceId,
        sendingAccountId: args.sendingAccountId,
      });
    }
  } catch (error) {
    // Protection must never break webhook ingestion.
    console.error("[deliverability-guard] failed", error);
  }
}
