/**
 * Campaign cost reporting.
 *
 * Sendloop owns the sending infrastructure, so cost is derived from the
 * provider rate card (`email_providers.cost_per_1k_cents`) behind each mailbox
 * the campaign uses. Customers never see provider names — only rates and totals.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignCost = {
  /** Blended cost of a single send, in cents. */
  costPerSendCents: number;
  sentCount: number;
  totalSpentCents: number;
  /** Messages already queued but not sent yet. */
  queuedCount: number;
  queuedCostCents: number;
  /** Follow-up emails still to be generated for in-flight recipients. */
  projectedFollowUps: number;
  /** Sends we expect over the next 30 days, after daily-cap pacing. */
  projectedSends30d: number;
  projectedCost30dCents: number;
  dailyCap: number;
  stepsPerLead: number;
  sentLast30d: number;
  spentLast30dCents: number;
  mailboxes: number;
};

export const getCampaignCost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CampaignCost> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign, error: cErr } = await context.supabase
      .from("campaigns")
      .select("id, sending_account_ids, daily_cap")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");

    const [messagesRes, stepsRes, recipientsRes] = await Promise.all([
      context.supabase
        .from("campaign_messages")
        .select("status, sent_at, sending_account_id")
        .eq("campaign_id", data.campaignId),
      context.supabase
        .from("campaign_steps")
        .select("id, step_type")
        .eq("campaign_id", data.campaignId),
      context.supabase
        .from("campaign_recipients")
        .select("status, current_step")
        .eq("campaign_id", data.campaignId),
    ]);
    if (messagesRes.error) throw new Error(messagesRes.error.message);
    if (stepsRes.error) throw new Error(stepsRes.error.message);
    if (recipientsRes.error) throw new Error(recipientsRes.error.message);

    const messages = messagesRes.data ?? [];
    const emailSteps = (stepsRes.data ?? []).filter((s) => s.step_type === "email").length || 1;
    const recipients = recipientsRes.data ?? [];

    // Blended cost per send: average of the provider rates behind the mailboxes
    // this campaign uses.
    const accountIds = (campaign.sending_account_ids ?? []) as string[];
    let costPerSendCents = 0;
    let mailboxes = 0;
    if (accountIds.length) {
      const { data: accounts } = await context.supabase
        .from("sending_accounts")
        .select("id, provider_id")
        .in("id", accountIds);
      mailboxes = accounts?.length ?? 0;
      const providerIds = [
        ...new Set((accounts ?? []).map((a) => a.provider_id).filter(Boolean)),
      ] as string[];
      if (providerIds.length) {
        const { data: providers } = await supabaseAdmin
          .from("email_providers")
          .select("id, cost_per_1k_cents")
          .in("id", providerIds);
        const rates = (providers ?? []).map((p) => (p.cost_per_1k_cents ?? 0) / 1000);
        if (rates.length) costPerSendCents = rates.reduce((a, b) => a + b, 0) / rates.length;
      }
    }

    const sentCount = messages.filter((m) => m.status === "sent").length;
    const queuedCount = messages.filter(
      (m) => m.status === "pending" || m.status === "scheduled" || m.status === "processing",
    ).length;

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sentLast30d = messages.filter(
      (m) => m.status === "sent" && m.sent_at && new Date(m.sent_at).getTime() >= cutoff,
    ).length;

    const activeRecipients = recipients.filter(
      (r) => r.status === "pending" || r.status === "in_progress",
    );
    const projectedFollowUps = activeRecipients.reduce(
      (total, r) => total + Math.max(0, emailSteps - Math.max(1, r.current_step ?? 0)),
      0,
    );

    const dailyCap = campaign.daily_cap ?? 0;
    const capacity30d = dailyCap > 0 ? dailyCap * 30 : Number.MAX_SAFE_INTEGER;
    const projectedSends30d = Math.min(queuedCount + projectedFollowUps, capacity30d);

    const cents = (n: number) => Math.round(n * costPerSendCents);

    return {
      costPerSendCents,
      sentCount,
      totalSpentCents: cents(sentCount),
      queuedCount,
      queuedCostCents: cents(queuedCount),
      projectedFollowUps,
      projectedSends30d,
      projectedCost30dCents: cents(projectedSends30d),
      dailyCap,
      stepsPerLead: emailSteps,
      sentLast30d,
      spentLast30dCents: cents(sentLast30d),
      mailboxes,
    };
  });
