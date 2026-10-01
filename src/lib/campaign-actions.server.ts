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
  selectCampaignVariant,
  senderExtras,
  type Campaign,
  type CustomVariable,
} from "@/lib/campaign-model";
import { unsubscribeExtras } from "@/lib/unsubscribe";
import { normalizeSendDays, windowStartAt } from "@/lib/campaign-schedule";
import {
  mailboxDailyRemaining,
  mailboxSentToday,
  mailboxWindowStart,
} from "@/lib/mailbox-daily-usage";


/** Launch a campaign: validate, materialise the queue and flip it to active. */
export async function launchCampaignService(
  supabase: Client,
  actorId: string,
  campaignId: string,
  options: { budgetMs?: number; mode?: "launch" | "continue" } = {},
) {
    const mode = options.mode ?? "launch";
    const t0 = Date.now();
    // One worker invocation has a hard CPU/time limit, so a large audience is
    // built across several calls. Every step below is idempotent, so the next
    // call resumes exactly where this one stopped.
    const startedAt = Date.now();
    // The launch request only does a short first pass; the remaining queue is
    // built by the background continuation (run-campaigns cron) so Launch
    // returns in seconds even for 10k-lead campaigns.
    const budgetMs = options.budgetMs ?? (mode === "launch" ? 4_000 : 8_000);
    const outOfBudget = () => Date.now() - startedAt > budgetMs;
    let incomplete = false;
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select(await campaignColumns(supabase))
      .eq("id", campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");
    const c = withCampaignDefaults(campaign as unknown as Record<string, unknown>) as unknown as Campaign;

    const { evaluateLaunchReadiness, persistReadiness, recordLaunchEvent } =
      await import("@/lib/campaign-launch.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let readiness: any = null;
    if (mode === "continue") {
      // Background continuation: the launch already validated this campaign.
      // Stop preparing campaigns the user has since ended or reverted.
      if (!["active", "paused", "scheduled"].includes(String(c.status))) {
        await clearPreparationPending(c.id);
        return { queued: 0, total: 0, firstSendAt: null, heldForAi: 0, done: true as const, preparing: false };
      }
    } else {
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
    readiness = await evaluateLaunchReadiness(supabase, c.id);
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


    }
    console.log(`[launch] ${mode} ${c.id} VALIDATE: ${Date.now() - t0} ms`);

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
    const { data: firstStepVariants, error: variantErr } = await supabase
      .from("campaign_step_variants")
      .select("id, subject, body, weight")
      .eq("step_id", firstStep.id);
    if (variantErr) throw new Error(variantErr.message);

    const { data: accounts, error: aErr } = await supabase
      .from("sending_accounts")
      .select(
        "id, provider, status, customer_enabled, paused, daily_limit, sent_today, last_sent_at, from_name, from_email",
      )
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
    // Usage is read through the shared date-aware helper: a counter left over
    // from an earlier sending window must never make a mailbox look full.
    const usageWindowStart = mailboxWindowStart();
    let pool = active.map((a: any) => ({
      id: a.id,
      headroom: Math.max(
        0,
        Math.min(
          perInboxCap || Number.MAX_SAFE_INTEGER,
          mailboxDailyRemaining(a, usageWindowStart),
        ),
      ),
      sentToday: mailboxSentToday(a, usageWindowStart),
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
    const aiSettings = await campaignAiSettings(supabase, c.id);
    let heldForAi = 0;

    const firstSlot = windowStartAt(c.start_at ? new Date(c.start_at) : new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }, { includeCurrentDay: true }).toISOString();

    // ---- Phase 1: attach eligible leads, one bounded page at a time ---------
    //
    // The database decides which leads are still eligible (in the list, status
    // "new", not already attached), so the server never holds an audience in
    // memory. Attaching a page removes it from the next page's result, which
    // makes the whole loop naturally resumable after any failure.
    const PAGE = 200;
    const MAX_PAGES = 120; // hard ceiling: 24,000 leads of work per invocation
    let attached = 0;
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data: batch, error: batchErr } = await supabase.rpc("campaign_eligible_leads", {
        _campaign_id: c.id,
        _after: after,
        _limit: PAGE,
      });
      if (batchErr) throw new Error(batchErr.message);
      const leads = (batch ?? []) as Array<{ id: string }>;
      if (!leads.length) break;
      after = leads[leads.length - 1]!.id;

      const rows = leads.map((lead) => ({
        campaign_id: c.id,
        workspace_id: c.workspace_id,
        lead_id: lead.id,
        sending_account_id: pickAccount(),
        status: "pending" as const,
        current_step: 0,
        next_send_at: firstSlot,
      }));
      // Idempotent: a second launch (or a browser retry) can never attach the
      // same lead twice — the unique campaign_id + lead_id key absorbs it.
      const { error: insErr } = await supabase
        .from("campaign_recipients")
        .upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
      if (insErr) throw new Error(insErr.message);
      attached += rows.length;
      // Only stop early when a full page came back, i.e. more leads may remain.
      // A short page means the audience is fully attached, so the launch can
      // finish in this same invocation instead of asking for another pass.
      if (leads.length === PAGE && outOfBudget()) {
        incomplete = true;
        break;
      }
    }

    // ---- Phase 2: materialise the first email for anyone still missing it ---
    //
    // Covers freshly attached leads and recipients added earlier from the Leads
    // tab. The database returns only recipients with no step-1 message, so this
    // loop both resumes after a failure and never duplicates a queued email.
    const accountById = new Map(
      (accounts ?? []).map((a: any) => [a.id, a] as const),
    );
    let queuedMessages = 0;
    let afterRecipient: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      // The budget is checked *after* discovering whether work remains, so a
      // campaign whose queue is already complete always finishes and activates.
      const { data: batch, error: pendErr } = await supabase.rpc(
        "campaign_recipients_missing_first_message",
        { _campaign_id: c.id, _after: afterRecipient, _limit: PAGE },
      );
      if (pendErr) throw new Error(pendErr.message);
      const pending = (batch ?? []) as Array<Record<string, unknown>>;
      if (!pending.length) break;
      afterRecipient = String(pending[pending.length - 1]!["recipient_id"]);

      // AI snippets for this page only.
      const aiContent = new Map<string, string>();
      if (aiSettings.enabled) {
        const leadIds = pending.map((r) => String(r["lead_id"]));
        const { data: aiRows, error: aiErr } = await supabase
          .from("ai_personalizations")
          .select("lead_id, content")
          .eq("campaign_id", c.id)
          .eq("status", "completed")
          .in("lead_id", leadIds);
        if (aiErr) throw new Error(aiErr.message);
        for (const row of (aiRows ?? []) as Array<{ lead_id: string; content: string | null }>) {
          if (row.content?.trim()) aiContent.set(row.lead_id, row.content.trim());
        }
      }

      const messages: Array<Record<string, unknown>> = [];
      const needsSlot: string[] = [];
      for (const row of pending) {
        const recipientId = String(row["recipient_id"]);
        const leadId = String(row["lead_id"]);
        const ai = aiSettings.enabled
          ? aiExtras(aiSettings.config, aiContent.get(leadId) ?? null)
          : { extras: {} as Record<string, string>, hold: false };
        if (ai.hold) {
          heldForAi += 1;
          continue;
        }
        const accountId = (row["sending_account_id"] as string | null) ?? pickAccount();
        if (!row["sending_account_id"]) needsSlot.push(recipientId);
        const lead = {
          id: leadId,
          email: row["email"],
          first_name: row["first_name"],
          last_name: row["last_name"],
          company: row["company"],
          job_title: row["job_title"],
          country: row["country"],
          city: row["city"],
          state: row["state"],
          website: row["website"],
          phone: row["phone"],
          linkedin_url: row["linkedin_url"],
          custom_fields: row["custom_fields"],
        };
        const selectedVariant = selectCampaignVariant(
          firstStepVariants ?? [],
          recipientId,
          firstStep.id,
        );
        const selectedCopy = selectedVariant ?? firstStep;
        messages.push({
          workspace_id: c.workspace_id,
          campaign_id: c.id,
          recipient_id: recipientId,
          lead_id: leadId,
          step_id: firstStep.id,
          variant_id: selectedVariant?.id ?? null,
          sending_account_id: accountId,
          step_order: 1,
          status: "scheduled" as const,
          to_email: lead.email,
          ...renderEmailForLead(selectedCopy, lead as never, {
            customVariables: campaignVariables,
            extras: {
              ...senderExtras(accountById.get(accountId) as never),
              ...unsubscribeExtras({
                workspaceId: c.workspace_id as string,
                campaignId: c.id as string,
                email: String(lead.email),
                recipientId,
              }),
              ...ai.extras,
            },
          }),
          scheduled_at: firstSlot,
          provider: (accountById.get(accountId) as { provider?: string } | undefined)?.provider ?? null,
        });
      }

      if (messages.length) {
        // The unique (campaign_id, recipient_id, step_order) key makes this
        // insert safe to repeat: a retried batch updates nothing and adds
        // nothing.
        const { error: mErr } = await supabase
          .from("campaign_messages")
          .upsert(messages as never, {
            onConflict: "campaign_id,recipient_id,step_order",
            ignoreDuplicates: true,
          });
        if (mErr) throw new Error(mErr.message);
        queuedMessages += messages.length;
      }
      if (needsSlot.length) {
        const { error: slotErr } = await supabase
          .from("campaign_recipients")
          .update({ next_send_at: firstSlot })
          .in("id", needsSlot);
        if (slotErr) throw new Error(slotErr.message);
      }
      // Same rule as phase 1: only ask for another pass when a full page came
      // back, which is the only case where more work can still be waiting.
      if (pending.length === PAGE && outOfBudget()) {
        incomplete = true;
        break;
      }
    }


    // Ran out of invocation budget: the queue is partially built and every
    // step is idempotent, so the caller simply calls launch again to continue.
    // The campaign stays out of "active" until the whole audience is queued.
    console.log(
      `[launch] ${mode} ${c.id} PREPARE: ${Date.now() - t0} ms queued=${queuedMessages} incomplete=${incomplete}`,
    );
    if (incomplete) {
      // Hand the rest to the background continuation (idempotent, bounded).
      await markPreparationPending(c.id);
      if (mode === "continue" || c.status === "active") {
        return {
          queued: queuedMessages,
          total: attached,
          firstSendAt: firstSlot,
          heldForAi,
          done: true as const,
          preparing: true,
        };
      }
    } else {
      await clearPreparationPending(c.id);
      if (mode === "continue") {
        return { queued: queuedMessages, total: attached, firstSendAt: firstSlot, heldForAi, done: true as const, preparing: false };
      }
    }

    const { error: uErr } = await supabase
      .from("campaigns")
      .update({ status: "active", launched_at: new Date().toISOString() })
      .eq("id", c.id);
    if (uErr) throw new Error(uErr.message);

    // Real totals straight from the database, counted not listed.
    const [{ count: scheduledCount }, { count: recipientTotal }] = await Promise.all([
      supabase
        .from("campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .eq("status", "scheduled"),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id),
    ]);
    const totalRecipients = recipientTotal ?? attached;

    await recordLaunchEvent(supabase, {
      // Launch validation already computed and persisted this exact snapshot.
      // Re-running it here duplicated the full audience read while all launch
      // rows were still resident in memory, which could exhaust the worker.
      readiness,
      actorId: actorId,
      outcome: "launched",
      queuedMessages: scheduledCount ?? 0,
      totalRecipients,
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
        "campaign.recipients": String(totalRecipients),
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
        recipients: totalRecipients,
        queued: queuedMessages,
        first_send_at: firstSlot,
      },
    );

    return {
      queued: queuedMessages,
      total: totalRecipients,
      firstSendAt: firstSlot,
      heldForAi,
      done: true as const,
      preparing: incomplete,
    };
}

const PREP_KEY = (id: string) => `campaign_prep:${id}`;

/** Records that a launched campaign still has queue preparation remaining. */
export async function markPreparationPending(campaignId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("platform_settings")
    .upsert(
      { key: PREP_KEY(campaignId), value: { campaignId, at: new Date().toISOString() } } as never,
      { onConflict: "key" },
    );
}

export async function clearPreparationPending(campaignId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("platform_settings").delete().eq("key", PREP_KEY(campaignId));
}

/**
 * Background continuation used by the campaign runner: finishes building the
 * queue for launched campaigns in bounded, idempotent passes.
 */
export async function continuePendingPreparations(budgetMs = 15_000) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key")
    .like("key", "campaign_prep:%")
    .limit(5);
  const startedAt = Date.now();
  const results: Array<{ campaignId: string; queued: number; preparing: boolean; error?: string }> = [];
  for (const row of (data ?? []) as Array<{ key: string }>) {
    const left = budgetMs - (Date.now() - startedAt);
    if (left < 2_000) break;
    const campaignId = row.key.slice("campaign_prep:".length);
    try {
      const r = await launchCampaignService(supabaseAdmin, "", campaignId, {
        mode: "continue",
        budgetMs: Math.min(8_000, left - 1_000),
      });
      results.push({ campaignId, queued: r.queued, preparing: Boolean(r.preparing) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "Campaign not found") await clearPreparationPending(campaignId);
      results.push({ campaignId, queued: 0, preparing: true, error: message });
    }
  }
  return results;
}
