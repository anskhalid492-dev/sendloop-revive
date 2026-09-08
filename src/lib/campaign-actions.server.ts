/**
 * Campaign application services.
 *
 * These are the single implementation of the stateful campaign operations.
 * Both the dashboard server functions (`campaigns.functions.ts`) and the public
 * REST API (`/api/v1/campaigns/...`) call into this module, so scheduling,
 * limits, billing entitlements, unsubscribe handling and the launch audit trail
 * behave identically no matter which surface triggered them.
 */

// The generated Supabase types make these chained queries extremely noisy and
// the handlers validate every field they read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

import {
  campaignColumns,
  campaignLimitColumnsAvailable,
  withCampaignDefaults,
  renderEmailForLead,
  senderExtras,
  type Campaign,
  type CustomVariable,
} from "@/lib/campaign-model";
import { unsubscribeExtras } from "@/lib/unsubscribe";
import { normalizeSendDays, windowStartAt } from "@/lib/campaign-schedule";

/** Launch a campaign: validate, materialise the queue and flip it to active. */
export async function launchCampaignService(
  supabase: Client,
  actorId: string,
  campaignId: string,
) {
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select(await campaignColumns(supabase))
      .eq("id", campaignId)
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
    const limitsSupported = await campaignLimitColumnsAvailable(supabase);
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

    const readiness = await evaluateLaunchReadiness(supabase, c.id);
    await persistReadiness(supabase, readiness);
    if (!readiness.ready) {
      // Audit the blocked attempt with the exact reasons before failing.
      await recordLaunchEvent(supabase, {
        readiness,
        actorId: actorId,
        outcome: "blocked",
        errorMessage: readiness.issues[0]!.message,
      });
      throw new Error(readiness.issues[0]!.message);
    }


    const { data: steps, error: sErr } = await supabase
      .from("campaign_steps")
      .select("id, subject, body, step_type")
      .eq("campaign_id", c.id)
      .order("step_order", { ascending: true });
    if (sErr) throw new Error(sErr.message);
    const firstStep = steps?.find((s: any) => s.step_type === "email");
    if (!firstStep || !firstStep.subject.trim() || !firstStep.body.trim()) {
      throw new Error("The first email step needs a subject and a body before launching.");
    }

    const { data: accounts, error: aErr } = await supabase
      .from("sending_accounts")
      .select("id, provider, status, customer_enabled, paused, daily_limit, sent_today, from_name, from_email")
      .in("id", c.sending_account_ids);
    if (aErr) throw new Error(aErr.message);
    const active = (accounts ?? []).filter(
      (a: any) => a.status !== "disabled" && a.customer_enabled && !a.paused,
    );
    if (!active.length) throw new Error("No active sending accounts are available.");

    // Inbox rotation. When rotation is off every send goes through the first
    // active mailbox; otherwise leads are spread across mailboxes using the
    // strategy chosen in the campaign settings, honouring the per-inbox cap.
    const campaignVariables = (c.custom_variables ?? []) as CustomVariable[];
    const rotationOn = c.inbox_rotation_enabled !== false;
    const perInboxCap = c.rotation_daily_cap_per_inbox || 0;
    let pool = active.map((a: any) => ({
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
        .map((a: any) => ({ a, r: Math.random() }))
        .sort((x: any, y: any) => x.r - y.r)
        .map(({ a }: any) => a);
    else if (c.inbox_rotation_strategy === "least_used")
      pool = [...pool].sort((a: any, b: any) => a.sentToday - b.sentToday || b.headroom - a.headroom);

    const usable = pool.map((a: any) => a.id);

    /** Pick the mailbox for the nth lead, skipping inboxes that are out of headroom. */
    const remaining = new Map<string, number>(pool.map((a: any) => [a.id, a.headroom] as [string, number]));
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
    const { campaignAiSettings, aiExtras } = await import("@/lib/ai-personalization-meta.server");
    // URL-safe id filters + full pagination: see supabase-batch for why.
    const { fetchByIds, fetchAllRows } = await import("@/lib/supabase-batch");
    const aiSettings = await campaignAiSettings(supabase, c.id);
    const aiContent = new Map<string, string>();
    if (aiSettings.enabled) {
      const aiRows = await fetchAllRows<{ lead_id: string; content: string | null }>(() =>
        supabase
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
        (ids) => supabase.from("leads").select(LEAD_FIELDS).in("id", ids),
      );
    }

    // Paged so campaigns with more than 1,000 recipients are deduplicated
    // correctly instead of re-inserting rows that already exist.
    const existing = await fetchAllRows<{ lead_id: string }>(() =>
      supabase.from("campaign_recipients").select("lead_id").eq("campaign_id", c.id),
    );
    const already = new Set(existing.map((r) => r.lead_id));

    const firstSlot = windowStartAt(c.start_at ? new Date(c.start_at) : new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }, { includeCurrentDay: true }).toISOString();

    const fresh = leads.filter((l) => !already.has(String(l["id"]))) as Array<
      Record<string, unknown> & { id: string; email: string }
    >;
    if (fresh.length) {
      const accountById = new Map(
        (accounts ?? []).map((a: any) => [a.id, a as { id: string }] as const),
      );
      const senderFor = (id: string | null) =>
        senderExtras(
          (accounts ?? []).find((a: any) => a.id === id) as never,
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
        const { data: inserted, error: insErr } = await supabase
          .from("campaign_recipients")
          .insert(slice)
          .select("id, lead_id, sending_account_id");
        if (insErr) throw new Error(insErr.message);

        // Materialise the first email of the sequence into the sending queue.
        const leadById = new Map(
          (fresh as unknown as Array<{ id: string }>).map((l) => [l.id, l] as const),
        );
        const messages = (inserted ?? [])
          .map((recipient: any) => {
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
                extras: {
                  ...senderFor(recipient.sending_account_id),
                  ...unsubscribeExtras({
                    workspaceId: c.workspace_id as string,
                    campaignId: c.id as string,
                    email: (lead as { email: string }).email,
                    recipientId: recipient.id,
                  }),
                  ...ai.extras,
                },
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
          const { error: mErr } = await supabase
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
      supabase
        .from("campaign_recipients")
        .select("id, lead_id, sending_account_id")
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .eq("current_step", 0),
    );

    if (pendingRecipients.length) {
      const existingMsgs = await fetchAllRows<{ recipient_id: string | null }>(() =>
        supabase
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
          (ids) => supabase.from("leads").select(LEAD_FIELDS).in("id", ids),
        );
        const leadById = new Map(leadRows.map((l) => [l.id, l] as const));
        const backfill = missing
          .map((recipient: any) => {
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
                  ...senderExtras((accounts ?? []).find((a: any) => a.id === accountId) as never),
                  ...unsubscribeExtras({
                    workspaceId: c.workspace_id as string,
                    campaignId: c.id as string,
                    email: lead.email as string,
                    recipientId: recipient.id,
                  }),
                  ...ai.extras,
                },
              }),

              scheduled_at: firstSlot,
              provider:
                (accounts ?? []).find((a: any) => a.id === accountId)?.provider ?? null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;

        for (let i = 0; i < backfill.length; i += 500) {
          const { error: bErr } = await supabase
            .from("campaign_messages")
            .insert(backfill.slice(i, i + 500) as never);
          if (bErr) throw new Error(bErr.message);
        }
        // Recipients without a mailbox get one assigned on launch.
        for (const recipient of missing.filter((r) => !r.sending_account_id)) {
          await supabase
            .from("campaign_recipients")
            .update({ next_send_at: firstSlot })
            .eq("id", recipient.id);
        }
      }
    }

    const { error: uErr } = await supabase
      .from("campaigns")
      .update({ status: "active", launched_at: new Date().toISOString() })
      .eq("id", c.id);
    if (uErr) throw new Error(uErr.message);

    // Real queued message count straight from the queue, for the audit trail.
    const { count: scheduledCount } = await supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "scheduled");

    const postReadiness = await refreshReadiness(supabase, c.id);
    await recordLaunchEvent(supabase, {
      readiness: { ...readiness, ...postReadiness, issues: readiness.issues },
      actorId: actorId,
      outcome: "launched",
      queuedMessages: scheduledCount ?? 0,
      totalRecipients: already.size + fresh.length,
      firstSendAt: firstSlot,
    });

    const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
    await emitTransactionalEvent({
      eventKey: "campaign.launched",
      userId: actorId,
      workspaceId: c.workspace_id as string,
      idempotencyKey: `campaign.launched:${c.id as string}`,
      variables: {
        "campaign.name": c.name,
        "campaign.recipients": String(already.size + fresh.length),
        "campaign.status": "active",
      },
    });

    // Public API subscribers see the same launch the dashboard just performed.
    const { enqueueWebhookEvent } = await import("@/lib/api/v1/webhook-delivery.server");
    void enqueueWebhookEvent(
      supabase,
      c.workspace_id as string,
      "campaign.launched",
      `campaign.launched:${c.id as string}`,
      {
        campaign_id: c.id,
        name: c.name,
        recipients: already.size + fresh.length,
        queued: fresh.length,
        first_send_at: firstSlot,
      },
    );

    return {
      queued: fresh.length,
      total: already.size + fresh.length,
      firstSendAt: firstSlot,
      heldForAi,
    };
}
