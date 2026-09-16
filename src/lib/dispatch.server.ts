/**
 * Server-only sending engine shared by the in-app "Send due now" action and the
 * automatic campaign runner (cron endpoint).
 *
 * Two responsibilities:
 *  - `dispatchDueMessages`: turn queued `campaign_messages` into real emails.
 *  - `scheduleFollowUps`: walk each recipient through the sequence, materialising
 *    the next email step once its delay has elapsed.
 */
import { enqueueWebhookEvent } from "@/lib/api/v1/webhook-delivery.server";
import {
  MAX_MAILBOX_HOURLY_MESSAGE,
  campaignHourlyLimit,
} from "@/lib/mailbox-hourly-cap";
import { campaignScheduleState, normalizeSendDays, windowStartAt, zonedStartOfDay, type ScheduleWindow } from "@/lib/campaign-schedule";
import { isRetryableFailure } from "@/lib/campaign-run-state";

import { mailboxSentToday, mailboxWindowStart, nextStoredSentToday } from "@/lib/mailbox-daily-usage";
import {
  NO_MAILBOX_AVAILABLE_MESSAGE,
  isEligibleMailbox,
  mailboxRetryAt,
  selectMailboxForMessage,
} from "@/lib/mailbox-assignment";
import { stripAngle } from "@/lib/inbox-model";
import { buildSentSnapshot } from "@/lib/sent-snapshot";
import { persistSentSnapshot } from "@/lib/sent-snapshot.server";
import { campaignBodyHtml } from "@/lib/email-html";
import {
  applyUnsubscribeUrl,
  unsubscribeExtras,
  unsubscribeUrl,
  withUnsubscribeSource,
} from "@/lib/unsubscribe";
import {
  renderEmailForLead,
  senderExtras,
  resolveSpintax,

  type CustomVariable,
  type StepType,
} from "@/lib/campaign-model";

/** Any Supabase client (user-scoped or service role). Kept loose on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabase = any;

type AccountRow = {
  id: string;
  provider: string;
  provider_id: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  sent_today: number;
  daily_limit: number;
  last_sent_at?: string | null;
  hourly_limit?: number | null;
  paused: boolean;
  customer_enabled: boolean;
  status: string;
};

export type DispatchResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  scheduled: number;
  errors: string[];
};

type DispatchDiagnostic = {
  phase?: "eligibility" | "selection" | "rejection" | "mailbox_check" | "claim" | "provider_send";
  campaignId: string;
  now: string;
  timezone?: string;
  windowStart?: string;
  windowEnd?: string;
  inWindow?: boolean;
  eligibleMessages?: number;
  selectedMessages?: number;
  messageId?: string;
  mailboxId?: string | null;
  mailboxEligible?: boolean;
  reason?: string;
  providerResult?: "accepted" | "rejected" | "error";
};

function logDispatchDiagnostic(event: DispatchDiagnostic) {
  console.info("campaign-dispatch-diagnostic", JSON.stringify(event));
}

export function emptyResult(): DispatchResult {
  return { processed: 0, sent: 0, failed: 0, skipped: 0, scheduled: 0, errors: [] };
}

/** Pure scheduling decision used by the dispatcher and parity regression tests. */
export function campaignDispatchSchedule(now: Date, window: ScheduleWindow) {
  return campaignScheduleState(now, window);
}

/** Pure parity check for the database due-message filter at a scheduler tick. */
export function isMessageDispatchEligible(
  message: { status: string; scheduledAt: Date | null },
  now: Date,
  window: ScheduleWindow,
): boolean {
  return (
    campaignDispatchSchedule(now, window).inWindow &&
    ["pending", "scheduled"].includes(message.status) &&
    (!message.scheduledAt || message.scheduledAt.getTime() <= now.getTime())
  );
}

type StepRow = {
  id: string;
  step_order: number;
  subject: string;
  body: string;
  wait_days: number;
  wait_hours: number;
  delay_minutes: number;
  step_type: StepType;
};

type CampaignDispatchRow = {
  id: string;
  workspace_id: string;
  status: string;
  timezone: string;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  daily_cap: number;
  start_at: string | null;
  end_at: string | null;
  sending_account_ids?: string[] | null;
  custom_variables?: CustomVariable[] | null;
  ai_enabled?: boolean | null;
  ai_config?: unknown;
};

type InitialRecipientRow = {
  id: string;
  lead_id: string;
  sending_account_id: string | null;
};

type InitialLeadRow = {
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

type InitialAccountRow = {
  id: string;
  provider: string | null;
  from_name: string;
  from_email: string;
  status: string;
  customer_enabled: boolean;
  paused: boolean;
};

/** Total delay in ms configured on a step. */
function stepDelayMs(step: StepRow): number {
  return (
    (step.wait_days ?? 0) * 86_400_000 +
    (step.wait_hours ?? 0) * 3_600_000 +
    (step.delay_minutes ?? 0) * 60_000
  );
}

function campaignWindow(campaign: Pick<CampaignDispatchRow, "timezone" | "send_days" | "send_start_hour" | "send_end_hour">) {
  return {
    timezone: campaign.timezone || "UTC",
    sendDays: normalizeSendDays(campaign.send_days),
    startHour: campaign.send_start_hour ?? 9,
    endHour: campaign.send_end_hour ?? 17,
  };
}

function campaignScheduleAnchor(campaign: Pick<CampaignDispatchRow, "start_at">, now: Date) {
  const start = campaign.start_at ? new Date(campaign.start_at) : null;
  return start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime() ? start : now;
}

/**
 * Repair/materialise first-step queue rows for active campaigns that already
 * have recipients but no initial message rows. This keeps the runner resilient
 * for campaigns created before the launch backfill existed.
 */
export async function ensureInitialCampaignMessages(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
  /** Registry client; defaults to the service-role client. */
  registryClient?: AnySupabase,
): Promise<number> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "id, workspace_id, status, timezone, send_days, send_start_hour, send_end_hour, daily_cap, start_at, end_at, sending_account_ids, custom_variables, ai_enabled, ai_config",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign || !["active", "scheduled"].includes(campaign.status)) return 0;

  const endAt = campaign.end_at ? new Date(campaign.end_at) : null;
  if (endAt && !Number.isNaN(endAt.getTime()) && endAt.getTime() <= now.getTime()) return 0;

  const { data: stepRows, error: stepError } = await supabase
    .from("campaign_steps")
    .select("id, step_order, subject, body, wait_days, wait_hours, delay_minutes, step_type")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });
  if (stepError) throw new Error(stepError.message);
  const firstStep = ((stepRows ?? []) as StepRow[]).find(
    (step) => step.step_type === "email" && step.subject.trim() && step.body.trim(),
  );
  if (!firstStep) return 0;

  const { fetchAllRows, fetchByIds } = await import("@/lib/supabase-batch");
  const pendingRecipients = await fetchAllRows<InitialRecipientRow>(() =>
    supabase
      .from("campaign_recipients")
      .select("id, lead_id, sending_account_id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .eq("current_step", 0)
      .order("id", { ascending: true }),
  );
  if (!pendingRecipients.length) return 0;

  const existingMsgs = await fetchAllRows<{ recipient_id: string | null }>(() =>
    supabase
      .from("campaign_messages")
      .select("recipient_id")
      .eq("campaign_id", campaignId)
      .eq("step_order", firstStep.step_order),
  );
  const hasMessage = new Set(existingMsgs.map((message) => message.recipient_id).filter(Boolean));
  const missing = pendingRecipients.filter((recipient) => !hasMessage.has(recipient.id));
  if (!missing.length) return 0;

  const leadRows = await fetchByIds<InitialLeadRow>(
    missing.map((recipient) => recipient.lead_id),
    (ids) =>
      supabase
        .from("leads")
        .select(
          "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
        )
        .in("id", ids),
  );
  const leadById = new Map(leadRows.map((lead) => [lead.id, lead] as const));

  const configuredAccountIds = (campaign.sending_account_ids ?? []).filter(Boolean);
  const { data: accountRows } = configuredAccountIds.length
    ? await supabase
        .from("sending_accounts")
        .select("id, provider, from_name, from_email, status, customer_enabled, paused")
        .in("id", configuredAccountIds)
    : { data: [] as InitialAccountRow[] };
  // New queue rows are never pinned to a mailbox whose provider is switched off
  // for customer sending.
  const { data: providerRowsForPlan } = await supabase
    .from("email_providers")
    .select("provider, is_enabled, customer_enabled");
  const planAllowedProviders = providerRowsForPlan?.length
    ? new Set(
        (providerRowsForPlan as Array<{ provider: string; is_enabled: boolean | null; customer_enabled: boolean | null }>)
          .filter((p) => p.is_enabled !== false && p.customer_enabled !== false)
          .map((p) => String(p.provider)),
      )
    : null;
  const accounts = ((accountRows ?? []) as InitialAccountRow[]).filter((account) =>
    isEligibleMailbox(account, planAllowedProviders),
  );
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));
  let cursor = 0;
  const pickAccount = (current: string | null) => {
    if (current && accountById.has(current)) return current;
    if (!accounts.length) return null;
    const account = accounts[cursor % accounts.length];
    cursor += 1;
    return account?.id ?? null;
  };

  const { aiExtras, personalizationByLead, pendingPersonalizationLeads } = await import(
    "@/lib/ai-personalization-meta.server"
  );
  const { normalizeAiConfig } = await import("@/lib/ai-personalization-model");
  const aiEnabled = Boolean(campaign.ai_enabled);
  const aiConfig = normalizeAiConfig(campaign.ai_config);
  const leadIds = missing.map((recipient) => recipient.lead_id);
  const aiContent = aiEnabled
    ? await personalizationByLead(supabase, campaignId, leadIds)
    : new Map<string, string>();
  // Leads whose snippet is still generating are held back: queueing them now
  // would freeze the un-personalized copy into the outgoing email.
  const aiPending = aiEnabled
    ? await pendingPersonalizationLeads(supabase, campaignId, leadIds)
    : new Set<string>();


  const slot = windowStartAt(
    campaignScheduleAnchor(campaign, now),
    campaignWindow(campaign),
    { includeCurrentDay: true },
  ).toISOString();
  const variables = (campaign.custom_variables ?? []) as CustomVariable[];
  const inserts: Array<Record<string, unknown>> = [];
  const recipientAssignments: Array<{ id: string; accountId: string; nextAt: string }> = [];

  for (const recipient of missing) {
    const lead = leadById.get(recipient.lead_id);
    if (!lead) continue;
    const accountId = pickAccount(recipient.sending_account_id);
    if (!accountId) continue;
    const account = accountById.get(accountId);
    const ai = aiEnabled
      ? aiExtras(aiConfig, aiContent.get(recipient.lead_id) ?? null)
      : { extras: {} as Record<string, string>, hold: false };
    if (ai.hold || (aiEnabled && aiPending.has(recipient.lead_id))) continue;

    inserts.push({
      workspace_id: campaign.workspace_id,
      campaign_id: campaignId,
      recipient_id: recipient.id,
      lead_id: recipient.lead_id,
      step_id: firstStep.id,
      sending_account_id: accountId,
      step_order: firstStep.step_order,
      status: "scheduled",
      to_email: lead.email,
      ...renderEmailForLead(firstStep, lead as never, {
        customVariables: variables,
        extras: {
          ...senderExtras(account as never),
          ...unsubscribeExtras({
            workspaceId: campaign.workspace_id as string,
            campaignId,
            email: (lead as unknown as { email: string }).email,
            recipientId: recipient.id,
          }),
          ...ai.extras,
        },
      }),
      scheduled_at: slot,
      provider: account?.provider ?? null,
    });
    recipientAssignments.push({ id: recipient.id, accountId, nextAt: slot });
  }

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await supabase.from("campaign_messages").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  for (const assignment of recipientAssignments) {
    await supabase
      .from("campaign_recipients")
      .update({ sending_account_id: assignment.accountId, next_send_at: assignment.nextAt })
      .eq("id", assignment.id);
  }

  return inserts.length;
}

/**
 * Create the next email message for every recipient whose previous step has
 * been sent and whose follow-up delay has elapsed.
 */
export async function scheduleFollowUps(
  supabase: AnySupabase,
  campaignId: string,
): Promise<{ scheduled: number; completed: number }> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "id, workspace_id, status, timezone, send_days, send_start_hour, send_end_hour, custom_variables, stop_on_reply, ai_enabled, ai_config",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { scheduled: 0, completed: 0 };

  const { data: stepRows } = await supabase
    .from("campaign_steps")
    .select("id, step_order, subject, body, wait_days, wait_hours, delay_minutes, step_type")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });
  const steps = (stepRows ?? []) as StepRow[];
  if (steps.length < 2) return { scheduled: 0, completed: 0 };

  // Paged + chunked: a plain select() stops at 1,000 rows and a single
  // `in.(...)` filter with ~1,000 UUIDs is rejected as a bad request, so large
  // campaigns silently lost their follow-ups.
  const { fetchAllRows, fetchByIds } = await import("@/lib/supabase-batch");

  const recipients = await fetchAllRows<{
    id: string;
    lead_id: string;
    status: string;
    current_step: number;
    sending_account_id: string | null;
    last_sent_at: string | null;
  }>(() =>
    supabase
      .from("campaign_recipients")
      .select("id, lead_id, status, current_step, sending_account_id, last_sent_at")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "in_progress"])
      .order("id", { ascending: true }),
  );
  if (!recipients.length) return { scheduled: 0, completed: 0 };

  const recipientIds = recipients.map((r: { id: string }) => r.id);
  const messages = await fetchByIds<{
    recipient_id: string | null;
    step_order: number;
    status: string;
    sent_at: string | null;
  }>(recipientIds, (ids) =>
    supabase
      .from("campaign_messages")
      .select("recipient_id, step_order, status, sent_at")
      .eq("campaign_id", campaignId)
      .in("recipient_id", ids),
  );


  const byRecipient = new Map<
    string,
    { lastSentOrder: number; lastSentAt: string | null; open: boolean }
  >();
  for (const m of (messages ?? []) as Array<{
    recipient_id: string | null;
    step_order: number;
    status: string;
    sent_at: string | null;
  }>) {
    if (!m.recipient_id) continue;
    const entry = byRecipient.get(m.recipient_id) ?? {
      lastSentOrder: 0,
      lastSentAt: null,
      open: false,
    };
    if (["pending", "scheduled", "processing"].includes(m.status)) entry.open = true;
    if (m.status === "sent" && m.step_order > entry.lastSentOrder) {
      entry.lastSentOrder = m.step_order;
      entry.lastSentAt = m.sent_at;
    }
    byRecipient.set(m.recipient_id, entry);
  }

  const leadIds = recipients.map((r: { lead_id: string }) => r.lead_id);
  const leads = await fetchByIds<{ id: string }>(leadIds, (ids) =>
    supabase
      .from("leads")
      .select(
        "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
      )
      .in("id", ids),
  );
  const leadById = new Map(leads.map((l: { id: string }) => [l.id, l] as const));

  const variables = (campaign.custom_variables ?? []) as CustomVariable[];

  // {{sender_name}} / {{sender_email}} come from the mailbox each recipient is
  // assigned to, so a rotated sequence signs off with the right person.
  const accountIds = [
    ...new Set(
      recipients
        .map((r: { sending_account_id: string | null }) => r.sending_account_id)
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  ];
  const { data: senderRows } = accountIds.length
    ? await supabase
        .from("sending_accounts")
        .select("id, from_name, from_email")
        .in("id", accountIds)
    : { data: [] as Array<{ id: string; from_name: string; from_email: string }> };
  const senderById = new Map(
    ((senderRows ?? []) as Array<{ id: string }>).map((a) => [a.id, a] as const),
  );

  // Follow-ups reuse the AI snippet generated for this lead on this campaign, so
  // the whole sequence stays consistent instead of re-billing a generation.
  const { aiExtras, personalizationByLead, pendingPersonalizationLeads } = await import(
    "@/lib/ai-personalization-meta.server"
  );
  const { normalizeAiConfig } = await import("@/lib/ai-personalization-model");
  const aiEnabled = Boolean(campaign.ai_enabled);
  const aiConfig = normalizeAiConfig(campaign.ai_config);
  const aiContent = aiEnabled
    ? await personalizationByLead(supabase, campaignId, leadIds)
    : new Map<string, string>();
  // Still generating: hold the lead rather than baking a fallback into the copy.
  const aiPending = aiEnabled
    ? await pendingPersonalizationLeads(supabase, campaignId, leadIds)
    : new Set<string>();

  const window = {
    timezone: campaign.timezone,
    sendDays: normalizeSendDays(campaign.send_days),
    startHour: campaign.send_start_hour,
    endHour: campaign.send_end_hour,
  };

  const now = Date.now();
  const inserts: Array<Record<string, unknown>> = [];
  const advanced: Array<{ id: string; step: number; nextAt: string }> = [];
  const finished: string[] = [];

  for (const recipient of recipients) {
    const state = byRecipient.get(recipient.id);
    if (!state || state.open || state.lastSentOrder === 0) continue;

    // Walk forward from the step we just sent, accumulating wait time until we
    // reach the next email step (or the sequence ends / hits a stop step).
    let delay = 0;
    let next: StepRow | null = null;
    for (const step of steps.filter((s) => s.step_order > state.lastSentOrder)) {
      delay += stepDelayMs(step);
      if (step.step_type === "stop") break;
      if (step.step_type === "email") {
        next = step;
        break;
      }
    }

    if (!next) {
      finished.push(recipient.id);
      continue;
    }

    const base = state.lastSentAt ? new Date(state.lastSentAt).getTime() : now;
    const dueAt = new Date(base + Math.max(delay, 60_000));
    if (dueAt.getTime() > now) {
      // Not due yet — remember when it will be so the UI can show it.
      advanced.push({ id: recipient.id, step: state.lastSentOrder, nextAt: dueAt.toISOString() });
      continue;
    }

    const lead = leadById.get(recipient.lead_id);
    if (!lead) continue;
    const slot = windowStartAt(dueAt, window, { includeCurrentDay: true }).toISOString();
    const ai = aiEnabled
      ? aiExtras(aiConfig, aiContent.get(recipient.lead_id) ?? null)
      : { extras: {} as Record<string, string>, hold: false };
    // "hold" keeps the follow-up unqueued until its personalization lands.
    if (ai.hold || (aiEnabled && aiPending.has(recipient.lead_id))) continue;


    inserts.push({
      workspace_id: campaign.workspace_id,
      campaign_id: campaignId,
      recipient_id: recipient.id,
      lead_id: recipient.lead_id,
      step_id: next.id,
      sending_account_id: recipient.sending_account_id,
      step_order: next.step_order,
      status: "scheduled",
      to_email: (lead as unknown as { email: string }).email,
      ...renderEmailForLead(next, lead as never, {
        customVariables: variables,
        extras: {
          ...senderExtras(senderById.get(recipient.sending_account_id ?? "") as never),
          ...unsubscribeExtras({
            workspaceId: campaign.workspace_id as string,
            campaignId,
            email: (lead as unknown as { email: string }).email,
            recipientId: recipient.id,
          }),
          ...ai.extras,
        },
      }),

      scheduled_at: slot,
    });
    advanced.push({ id: recipient.id, step: next.step_order, nextAt: slot });
  }

  if (inserts.length) {
    const { error } = await supabase.from("campaign_messages").insert(inserts);
    if (error) throw new Error(error.message);
  }
  for (const row of advanced) {
    await supabase
      .from("campaign_recipients")
      .update({ current_step: row.step, next_send_at: row.nextAt, status: "in_progress" })
      .eq("id", row.id);
  }
  if (finished.length) {
    await supabase
      .from("campaign_recipients")
      .update({ status: "completed", next_send_at: null })
      .in("id", finished);
  }

  return { scheduled: inserts.length, completed: finished.length };
}

/**
 * Writes the terminal `sent` state after provider acceptance.
 *
 * Some deployments predate the optional `message_id` (RFC id) column on
 * `campaign_messages`. Postgres rejects the whole UPDATE with 42703 in that
 * case, which used to leave an accepted message stuck in `processing` and
 * missing from campaign statistics. The patch is retried without the optional
 * column so acceptance is always recorded immediately.
 */
export async function applySentPatch(
  supabase: AnySupabase,
  messageId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase.from("campaign_messages").update(patch).eq("id", messageId);
  if (!error) return true;
  const optional = ["message_id", "message_type"];
  const missing = optional.filter((column) =>
    `${error.message ?? ""}`.includes(`campaign_messages.${column}`) ||
    (`${error.message ?? ""}`.includes(column) && `${(error as { code?: string }).code ?? ""}` === "42703"),
  );
  if (!missing.length) return false;
  const reduced: Record<string, unknown> = { ...patch };
  for (const column of optional) delete reduced[column];
  const retry = await supabase.from("campaign_messages").update(reduced).eq("id", messageId);
  return !retry.error;
}

/** Send every due message of a campaign through its mailbox provider. */
export async function dispatchDueMessages(

  supabase: AnySupabase,
  options: { campaignId: string; limit?: number; force?: boolean; now?: Date; deadlineAt?: Date },
  dependencies: {
    sendManagedEmail?: (...args: any[]) => Promise<any>;
    consumeUsage?: (...args: any[]) => Promise<any>;
    releaseUsage?: (...args: any[]) => Promise<any>;
    EntitlementError?: any;
    suppressedSet?: (...args: any[]) => Promise<Map<string, string>>;
    mintCleanReplyAddress?: (...args: any[]) => Promise<string>;
    createOutboundRfcMessageId?: (...args: any[]) => string;
    messageIdHeader?: (...args: any[]) => string;
    recordOutboundCampaignMessage?: (...args: any[]) => Promise<any>;
    registerOutboundMessage?: (...args: any[]) => Promise<any>;
    supabaseAdmin?: AnySupabase;
  } = {},
): Promise<DispatchResult> {
  const recordOutboundCampaignMessage = dependencies.recordOutboundCampaignMessage ??
    (await import("./inbox.server")).recordOutboundCampaignMessage;
  const mintCleanReplyAddress = dependencies.mintCleanReplyAddress ??
    (await import("./inbound-routing.server")).mintCleanReplyAddress;
  const createOutboundRfcMessageId = dependencies.createOutboundRfcMessageId ??
    (await import("./outbound-threading.server")).createOutboundRfcMessageId;
  const suppressedSet = dependencies.suppressedSet ?? (await import("./suppression.server")).suppressedSet;
  const supabaseAdmin = dependencies.supabaseAdmin ??
    (await import("@/integrations/supabase/client.server")).supabaseAdmin;

  const limit = options.limit ?? 10;
  const now = options.now ?? new Date();
  const result = emptyResult();

  const { data: campaignRow, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, status, daily_cap, timezone, send_days, send_start_hour, send_end_hour, start_at, end_at, open_tracking, click_tracking, text_only, unsubscribe_enabled, ai_enabled, ai_config, sending_account_ids")
    .eq("id", options.campaignId)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaignRow) {
    logDispatchDiagnostic({ campaignId: options.campaignId, now: now.toISOString(), reason: "campaign_not_found" });
    return result;
  }

  // Self-heal FIRST, before any status/window gate: a paused or limit-reached
  // campaign must never leave provider-accepted messages stuck in `processing`.
  await completeAcceptedProcessingMessages(supabase, options.campaignId, now);

  if (!options.force && !["active", "scheduled"].includes(campaignRow.status)) {
    logDispatchDiagnostic({ campaignId: options.campaignId, now: now.toISOString(), reason: `campaign_status_${campaignRow.status}` });
    return result;
  }

  const startAt = campaignRow.start_at ? new Date(campaignRow.start_at) : null;
  if (!options.force && startAt && !Number.isNaN(startAt.getTime()) && startAt.getTime() > now.getTime()) {
    logDispatchDiagnostic({ campaignId: options.campaignId, now: now.toISOString(), reason: "campaign_start_at_future" });
    return result;
  }
  if (!options.force && campaignRow.status === "scheduled") {
    await supabase.from("campaigns").update({ status: "active" }).eq("id", options.campaignId).eq("status", "scheduled");
  }

  const endAt = campaignRow.end_at ? new Date(campaignRow.end_at) : null;
  if (!options.force && endAt && !Number.isNaN(endAt.getTime()) && endAt.getTime() <= now.getTime()) {
    await supabase.from("campaigns").update({ status: "completed" }).eq("id", options.campaignId).eq("status", "active");
    logDispatchDiagnostic({ campaignId: options.campaignId, now: now.toISOString(), reason: "campaign_end_at_reached" });
    return result;
  }

  const window = campaignWindow(campaignRow as CampaignDispatchRow);
  const dispatchSchedule = campaignDispatchSchedule(now, window);
  const diagnosticBase: DispatchDiagnostic = {
    campaignId: options.campaignId,
    now: now.toISOString(),
    timezone: window.timezone,
    windowStart: dispatchSchedule.eligibleWindowStart.toISOString(),
    windowEnd: `${campaignRow.send_end_hour}:00`,
    inWindow: dispatchSchedule.inWindow,
  };
  if (!dispatchSchedule.inWindow) {
    // Always the configured window START of the next sending day — never now,
    // never the previous run's finish time.
    const nextSlot = dispatchSchedule.eligibleWindowStart.toISOString();
    await supabase
      .from("campaign_messages")
      .update({ scheduled_at: nextSlot })
      .eq("campaign_id", options.campaignId)
      .in("status", ["pending", "scheduled"])
      .or(`scheduled_at.is.null,scheduled_at.lte.${now.toISOString()}`);
    result.errors.push(`Next sending window opens ${nextSlot}.`);
    logDispatchDiagnostic({ ...diagnosticBase, phase: "rejection", eligibleMessages: 0, selectedMessages: 0, reason: "outside_sending_window" });
    return result;
  }


  let query = supabase
    .from("campaign_messages")
    .select(
      "id, to_email, subject, body, sending_account_id, attempts, scheduled_at, workspace_id, campaign_id, lead_id, recipient_id, step_order",
    )
    .eq("campaign_id", options.campaignId)
    .in("status", ["pending", "scheduled"])
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (!options.force)
    query = query.or(`scheduled_at.is.null,scheduled_at.lte.${now.toISOString()}`);

  const { data: due, error } = await query;
  if (error) throw new Error(error.message);

  if (!due?.length) {
    const { count: queuedCount } = await supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", options.campaignId)
      .in("status", ["pending", "scheduled"]);
    logDispatchDiagnostic({
      ...diagnosticBase,
      phase: "selection",
      eligibleMessages: 0,
      selectedMessages: 0,
      reason: Number(queuedCount ?? 0) > 0 ? "queued_messages_scheduled_in_future" : "no_queued_messages",
    });
    return result;
  }
  logDispatchDiagnostic({
    ...diagnosticBase,
    phase: "selection",
    eligibleMessages: due.length,
    selectedMessages: due.length,
    reason: "messages_selected",
  });

  // Campaign daily sending limit (campaigns.daily_cap): counted across every
  // email this campaign sends today, follow-ups included.
  const dayStart = zonedStartOfDay(now, campaignRow.timezone || "UTC");
  const { count: sentTodayCount } = await supabase
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", options.campaignId)
    .eq("status", "sent")
    .gte("sent_at", dayStart.toISOString());
  const dailyCap = Number((campaignRow as { daily_cap?: number } | null)?.daily_cap ?? 0);
  let sentTodaySoFar = Number(sentTodayCount ?? 0);

  // Plan enforcement: sending is metered against the workspace plan. Both the
  // gate and the counter live server-side so cron and API callers are covered.
  const usage = dependencies.consumeUsage && dependencies.releaseUsage && dependencies.EntitlementError
    ? null
    : await import("@/lib/billing/usage.server");
  const consumeUsage = dependencies.consumeUsage ?? usage?.consumeUsage;
  const releaseUsage = dependencies.releaseUsage ?? usage?.releaseUsage;
  const EntitlementError = dependencies.EntitlementError ?? usage?.EntitlementError;
  if (!consumeUsage || !releaseUsage || !EntitlementError) {
    throw new Error("Campaign usage dependencies are unavailable.");
  }
  // Metering is per-message: a dispatch batch can span workspaces.

  // Bounced, complained and unsubscribed addresses are never emailed again.
  const suppressed = await suppressedSet(
    due[0].workspace_id,
    due.map((m: { to_email: string }) => m.to_email),
  );

  // The campaign's own mailbox pool is loaded alongside the mailboxes already
  // referenced by queued rows, so a message that lost (or never got) its
  // mailbox can be repaired instead of failed.
  const campaignMailboxPool = (
    ((campaignRow as { sending_account_ids?: string[] | null }).sending_account_ids ?? []) as string[]
  ).filter(Boolean);
  const accountIds = [
    ...new Set([
      ...(due.map((m: { sending_account_id: string | null }) => m.sending_account_id).filter(Boolean) as string[]),
      ...campaignMailboxPool,
    ]),
  ] as string[];
  const { data: accounts, error: aErr } = await supabase
    .from("sending_accounts")
    .select(
      "id, provider, provider_id, from_name, from_email, reply_to, sent_today, daily_limit, hourly_limit, last_sent_at, paused, customer_enabled, status",
    )
    .in("id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);
  if (aErr) throw new Error(aErr.message);
  const accountById = new Map(
    ((accounts ?? []) as AccountRow[]).map((a) => [a.id, a] as const),
  );

  // Providers currently enabled for CUSTOMER sending. A mailbox on a disabled
  // provider (e.g. SES switched off) is ineligible: without this the dispatcher
  // kept claiming its messages and deferring them forever.
  let allowedProviders: Set<string> | null = null;
  try {
    const { data: providerRows } = await supabase
      .from("email_providers")
      .select("provider, is_enabled, customer_enabled");
    if (providerRows?.length) {
      allowedProviders = new Set(
        (providerRows as Array<{ provider: string; is_enabled: boolean | null; customer_enabled: boolean | null }>)
          .filter((p) => p.is_enabled !== false && p.customer_enabled !== false)
          .map((p) => String(p.provider)),
      );
    }
  } catch {
    allowedProviders = null; // provider table unreadable: fall back to mailbox state only
  }

  const { fetchAllRows } = await import("@/lib/supabase-batch");
  // Mailbox capacity is a ROLLING 12-hour window over accepted sends only
  // (status `sent`), so a mailbox regains capacity 12 hours after the sends
  // that consumed it — never at midnight.
  const windowStart = mailboxWindowStart(now);
  const accountSentRows = accountIds.length
    ? await fetchAllRows<{ sending_account_id: string | null }>(() =>
        supabase
          .from("campaign_messages")
          .select("sending_account_id")
          .eq("status", "sent")
          .gte("sent_at", windowStart.toISOString())
          .in("sending_account_id", accountIds),
      )
    : [];
  const sentTodayByAccount = new Map<string, number>();
  for (const row of accountSentRows) {
    if (!row.sending_account_id) continue;
    sentTodayByAccount.set(row.sending_account_id, (sentTodayByAccount.get(row.sending_account_id) ?? 0) + 1);
  }

  // Hard platform ceiling: never more than 70 emails per mailbox per rolling
  // hour. Counted over accepted sends in the last 60 minutes.
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hourlyRows = accountIds.length
    ? await fetchAllRows<{ sending_account_id: string | null }>(() =>
        supabase
          .from("campaign_messages")
          .select("sending_account_id")
          .eq("status", "sent")
          .gte("sent_at", hourAgo.toISOString())
          .in("sending_account_id", accountIds),
      )
    : [];
  const sentThisHourByAccount = new Map<string, number>();
  for (const row of hourlyRows) {
    if (!row.sending_account_id) continue;
    sentThisHourByAccount.set(
      row.sending_account_id,
      (sentThisHourByAccount.get(row.sending_account_id) ?? 0) + 1,
    );
  }

  // Credentials are MunchReach-managed infrastructure resolved per send inside
  // `sendManagedEmail`; customer-supplied provider keys are never read.
  const sendManagedEmail = dependencies.sendManagedEmail ??
    (await import("./managed-sending.server")).sendManagedEmail;


  const { resolveAiTokenAtSend } = await import("@/lib/ai-personalization.server");
  const { normalizeAiConfig: normalizeSendAiConfig } = await import(
    "@/lib/ai-personalization-model"
  );
  const aiSendEnabled = Boolean((campaignRow as { ai_enabled?: boolean | null }).ai_enabled);
  const aiSendConfig = normalizeSendAiConfig((campaignRow as { ai_config?: unknown }).ai_config);

  const sentPerAccount = new Map<string, number>();
  let quotaDeferralSlot: string | null = null;


  for (const message of due) {
    // Hard wall-clock stop. Each send can take seconds (AI personalization,
    // provider latency, pacing), so a 25-message batch easily outlives the cron
    // HTTP timeout. Stopping here leaves untouched messages `scheduled` so the
    // next cron invocation continues the queue instead of the request dying
    // mid-batch.
    if (options.deadlineAt && Date.now() >= options.deadlineAt.getTime()) {
      logDispatchDiagnostic({ ...diagnosticBase, phase: "rejection", reason: "run_deadline_reached" });
      break;
    }
    result.processed += 1;
    let account = message.sending_account_id
      ? accountById.get(message.sending_account_id)
      : undefined;

    const fail = async (reason: string) => {
      result.failed += 1;
      if (result.errors.length < 5) result.errors.push(reason);
      await supabase
        .from("campaign_messages")
        .update({
          status: "failed",
          last_error: reason.slice(0, 500),
          attempts: (message.attempts ?? 0) + 1,
        })
        .eq("id", message.id);
    };

    const suppressionReason = suppressed.get((message.to_email ?? "").toLowerCase());
    if (suppressionReason) {
      result.skipped += 1;
      await supabase
        .from("campaign_messages")
        .update({ status: "cancelled", last_error: `Recipient ${suppressionReason}` })
        .eq("id", message.id);
      logDispatchDiagnostic({ ...diagnosticBase, messageId: message.id, mailboxId: message.sending_account_id, mailboxEligible: false, reason: `recipient_suppressed_${suppressionReason}` });
      continue;
    }

    // A mailbox that is missing, paused, disabled, disconnected, customer
    // disabled, or on a provider that is turned off can never send this
    // message. Repair the assignment from the campaign pool instead of
    // claiming-and-deferring the same row forever.
    const assignedIneligible = Boolean(account) && !isEligibleMailbox(account, allowedProviders);
    if (!account || assignedIneligible) {
      // Missing/stale mailbox: repair from the campaign pool instead of
      // failing the message. Nothing about the recipient is wrong.
      const usageById = new Map<string, number>();
      for (const id of campaignMailboxPool) {
        const candidate = accountById.get(id);
        if (!candidate) continue;
        usageById.set(
          id,
          mailboxSentToday(candidate, windowStart, sentTodayByAccount.get(id) ?? 0) +
            (sentPerAccount.get(id) ?? 0),
        );
      }
      const pickedId = selectMailboxForMessage({
        poolIds: campaignMailboxPool,
        accountsById: accountById,
        usageById,
        allowedProviders,
      });
      const picked = pickedId ? accountById.get(pickedId) : undefined;
      if (!picked) {
        // TEMPORARY condition — keep the message queued and retry later.
        result.skipped += 1;
        if (result.errors.length < 5) result.errors.push(NO_MAILBOX_AVAILABLE_MESSAGE);
        await supabase
          .from("campaign_messages")
          .update({
            status: "scheduled",
            scheduled_at: mailboxRetryAt(now, dispatchSchedule.nextWindowStart).toISOString(),
            last_error: NO_MAILBOX_AVAILABLE_MESSAGE,
          })
          .eq("id", message.id);
        logDispatchDiagnostic({ ...diagnosticBase, phase: "mailbox_check", messageId: message.id, mailboxId: message.sending_account_id, mailboxEligible: false, reason: "no_mailbox_available_deferred" });
        continue;
      }
      await supabase
        .from("campaign_messages")
        .update({ sending_account_id: picked.id })
        .eq("id", message.id);
      message.sending_account_id = picked.id;
      account = picked;
      logDispatchDiagnostic({ ...diagnosticBase, phase: "mailbox_check", messageId: message.id, mailboxId: picked.id, mailboxEligible: true, reason: "mailbox_assigned_from_campaign_pool" });
    }
    if (!isEligibleMailbox(account, allowedProviders)) {
      // Safety net: no eligible replacement existed. Defer with a clear reason
      // and a concrete retry time instead of re-claiming the row immediately.
      result.skipped += 1;
      if (result.errors.length < 5) result.errors.push(NO_MAILBOX_AVAILABLE_MESSAGE);
      await supabase
        .from("campaign_messages")
        .update({
          status: "scheduled",
          scheduled_at: mailboxRetryAt(now, dispatchSchedule.nextWindowStart).toISOString(),
          last_error: NO_MAILBOX_AVAILABLE_MESSAGE,
        })
        .eq("id", message.id);
      logDispatchDiagnostic({ ...diagnosticBase, phase: "mailbox_check", messageId: message.id, mailboxId: account.id, mailboxEligible: false, reason: account.paused ? "mailbox_paused" : !account.customer_enabled ? "mailbox_customer_disabled" : "mailbox_ineligible_deferred" });
      continue;
    }
    // Whichever active limit is lowest wins; the campaign daily cap is checked
    // before rolling mailbox capacity and workspace plan metering.
    if (dailyCap > 0 && sentTodaySoFar >= dailyCap) {
      result.skipped += 1;
      if (result.errors.length < 5)
        result.errors.push(`Daily sending limit reached (${dailyCap} emails/day).`);
      // The run waits for the NEXT scheduled day's window start. The campaign
      // stays active: quota exhaustion never completes or pauses it.
      quotaDeferralSlot = dispatchSchedule.nextWindowStart.toISOString();
      logDispatchDiagnostic({ ...diagnosticBase, phase: "rejection", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "campaign_daily_quota_reached" });
      break;
    }

    const usedNow = sentPerAccount.get(account.id) ?? 0;
    // The mailbox daily limit covers every email leaving that mailbox. The
    // campaign_messages count misses manual inbox sends, so the higher of the
    // two is authoritative — but the stored counter is date-aware and clamped,
    // so yesterday's total can never block today's sending.
    const accountSentToday = mailboxSentToday(
      account,
      windowStart,
      sentTodayByAccount.get(account.id) ?? 0,
    );
    if (accountSentToday + usedNow >= (account.daily_limit ?? 0)) {
      result.skipped += 1;
      logDispatchDiagnostic({ ...diagnosticBase, phase: "mailbox_check", messageId: message.id, mailboxId: account.id, mailboxEligible: false, reason: "mailbox_12_hour_capacity_reached" });
      continue;
    }
    // Hard 70/hour per-mailbox ceiling — independent of daily limits/pacing.
    const hourlyLimit = campaignHourlyLimit(account.hourly_limit);
    const sentThisHour = (sentThisHourByAccount.get(account.id) ?? 0) + usedNow;
    if (sentThisHour >= hourlyLimit) {
      result.skipped += 1;
      if (result.errors.length < 5) result.errors.push(MAX_MAILBOX_HOURLY_MESSAGE);
      logDispatchDiagnostic({ ...diagnosticBase, phase: "mailbox_check", messageId: message.id, mailboxId: account.id, mailboxEligible: false, reason: "mailbox_hourly_cap_reached" });
      continue;
    }
    logDispatchDiagnostic({
      ...diagnosticBase,
      phase: "mailbox_check",
      messageId: message.id,
      mailboxId: account.id,
      mailboxEligible: true,
      reason: "mailbox_capacity_available",
    });
    // Atomic monthly-send reservation: concurrent dispatch runs can never
    // push the workspace past its plan allowance.
    try {
      await consumeUsage(message.workspace_id as string, "emails_monthly", 1, "campaign_send");
    } catch (error) {
      if (error instanceof EntitlementError) {
        const entitlementMessage = error instanceof Error ? error.message : "Workspace sending limit reached.";
        result.skipped += 1;
        if (result.errors.length < 5) result.errors.push(entitlementMessage);
        await supabase
          .from("campaign_messages")
          .update({ status: "pending", last_error: entitlementMessage.slice(0, 500) })
          .eq("id", message.id);
        logDispatchDiagnostic({ ...diagnosticBase, phase: "rejection", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "workspace_plan_limit_reached" });
        continue;
      }
      throw error;
    }

    // Scheduler idempotency: claim the row by transitioning it out of the
    // queued states. Two overlapping runner invocations therefore cannot both
    // send the same message — the loser's update matches zero rows.
    const claim = await supabase
      .from("campaign_messages")
      .update({ status: "processing" })
      .eq("id", message.id)
      .in("status", ["pending", "scheduled"])
      .select("id");
    logDispatchDiagnostic({
      ...diagnosticBase,
      phase: "claim",
      messageId: message.id,
      mailboxId: account.id,
      mailboxEligible: true,
      reason: claim.error ? "message_claim_error" : Array.isArray(claim.data) && claim.data.length > 0 ? "message_claimed" : "message_claimed_by_another_runner",
    });
    if (claim.error) {
      await releaseUsage(message.workspace_id as string, "emails_monthly", 1, "claim_failed");
      throw new Error(claim.error.message);
    }
    if (!claim.error && Array.isArray(claim.data) && claim.data.length === 0) {
      // Already claimed by a concurrent run: give the plan reservation back.
      await releaseUsage(message.workspace_id as string, "emails_monthly", 1, "duplicate_claim");
      result.skipped += 1;
      logDispatchDiagnostic({ ...diagnosticBase, messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "message_claimed_by_another_runner" });
      continue;
    }


    // Keep the customer-visible Reply-To professional. A backend route record is
    // still created for audit/back-compat, while clean-address replies thread by
    // RFC Message-ID registry and strict mailbox/prospect fallback.
    let replyTo: string;
    try {
      replyTo = await mintCleanReplyAddress(account.from_email, {
        workspaceId: message.workspace_id,
        sendingAccountId: account.id,
        leadId: message.lead_id,
        campaignId: message.campaign_id,
        purpose: "campaign",
      });
    } catch (error) {
      await releaseUsage(message.workspace_id as string, "emails_monthly", 1, "send_failed");
      await fail(error instanceof Error ? error.message : "Reply routing is not ready for this mailbox.");
      continue;
    }
    // Send-time safety net: a snippet that landed after the message was
    // materialised still reaches the recipient, and a "hold" campaign never
    // sends an email with an unresolved AI line in it.
    if (aiSendEnabled) {
      const [resolvedSubject, resolvedBody] = await Promise.all([
        resolveAiTokenAtSend(supabase, message.campaign_id as string, message.lead_id, message.subject ?? "", aiSendConfig),
        resolveAiTokenAtSend(supabase, message.campaign_id as string, message.lead_id, message.body ?? "", aiSendConfig),
      ]);
      if (resolvedSubject.hold || resolvedBody.hold) {
        await releaseUsage(message.workspace_id as string, "emails_monthly", 1, "ai_hold");
        await supabase
          .from("campaign_messages")
          .update({ status: "scheduled", last_error: "Waiting for AI personalization." })
          .eq("id", message.id);
        result.skipped += 1;
        continue;
      }
      if (resolvedSubject.text !== message.subject || resolvedBody.text !== message.body) {
        message.subject = resolvedSubject.text;
        message.body = resolvedBody.text;
        await supabase
          .from("campaign_messages")
          .update({ subject: message.subject, body: message.body })
          .eq("id", message.id);
      }
    }

    // Unsubscribe: resolve the recipient-unique URL at send time so messages
    // queued before the link existed (empty "Unsubscribe:" footer) are repaired.
    const unsubUrl = (campaignRow as { unsubscribe_enabled?: boolean | null }).unsubscribe_enabled === false
      ? ""
      : unsubscribeUrl({
          workspaceId: message.workspace_id as string,
          campaignId: message.campaign_id as string,
          email: message.to_email as string,
          recipientId: (message.recipient_id as string | null) ?? null,
        });
    if (unsubUrl) {
      const repaired = applyUnsubscribeUrl(message.body ?? "", unsubUrl);
      if (repaired !== message.body) {
        message.body = repaired;
        await supabase
          .from("campaign_messages")
          .update({ body: message.body })
          .eq("id", message.id);
      }
    }
    const carriesUnsubscribeLink = Boolean(unsubUrl) && (message.body ?? "").includes(unsubUrl);

    const shouldSendHtml =
      !(campaignRow as { text_only?: boolean | null }).text_only &&
      (Boolean((campaignRow as { open_tracking?: boolean | null }).open_tracking) ||
        Boolean((campaignRow as { click_tracking?: boolean | null }).click_tracking) ||
        carriesUnsubscribeLink);
    let html = shouldSendHtml ? campaignBodyHtml(message.body) : null;

    // First-party open tracking. Only when the campaign's own "open tracking"
    // switch is on AND this email actually has an HTML part — a plain-text
    // email is never converted to HTML just to carry a pixel.
    if (html && Boolean((campaignRow as { open_tracking?: boolean | null }).open_tracking)) {
      const { injectOpenPixel, openPixelUrl } = await import("@/lib/open-tracking");
      html = injectOpenPixel(
        html,
        openPixelUrl({
          workspaceId: message.workspace_id as string,
          messageKind: "campaign",
          messageId: message.id as string,
          campaignId: message.campaign_id as string,
          leadId: (message.lead_id as string | null) ?? null,
          email: message.to_email as string,
        }),
      );
    }
    const outboundMessageId = createOutboundRfcMessageId(account.from_email);

    // Freeze the exact personalized email for this recipient BEFORE handing it
    // to the provider. This row — not the campaign template — is what the
    // Unified Inbox shows when the prospect replies.
    const sentSnapshot = buildSentSnapshot({
      subject: message.subject,
      body: message.body,
      html,
      fromEmail: account.from_email,
      fromName: account.from_name,
      toEmail: message.to_email,
      renderedAt: now.toISOString(),
    });
    await persistSentSnapshot(supabase, message.id, sentSnapshot);


    const outboundHeaders: Record<string, string> = {
      ...(carriesUnsubscribeLink
        ? {
            "List-Unsubscribe": `<${withUnsubscribeSource(unsubUrl, "list_unsubscribe")}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {}),
    };

    let send: Awaited<ReturnType<typeof sendManagedEmail>>;
    try {
      logDispatchDiagnostic({ ...diagnosticBase, phase: "provider_send", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "provider_send_started" });

      // Customer-owned mailbox (the `mailboxes` table): the email leaves through
      // that mailbox's own SMTP server, always via the mailbox-smtp-relay edge
      // function — never a direct socket from this runtime.
      const { findCustomerMailbox, sendViaCustomerMailbox } = await import(
        "@/lib/customer-mailbox-send.server"
      );
      const customerMailbox = await findCustomerMailbox(
        supabaseAdmin,
        message.workspace_id as string,
        account.from_email as string,
      );

      if (customerMailbox) {
        const relayed = await sendViaCustomerMailbox(supabaseAdmin, customerMailbox, {
          to: message.to_email as string,
          subject: message.subject as string,
          html,
          text: message.body,
          fromName: account.from_name,
          ...(replyTo ? { headers: { ...outboundHeaders, "Reply-To": replyTo } } : { headers: outboundHeaders }),
        });
        send = {
          ok: relayed.ok,
          message: relayed.message,
          messageId: relayed.messageId,
        } as Awaited<ReturnType<typeof sendManagedEmail>>;
      } else {
        // Locked down: a customer campaign may only leave through a mailbox the
        // customer connected themselves (SMTP/IMAP). There is no shared-provider
        // fallback. Refuse loudly with the real reason and keep the message
        // queued (handled below as an infrastructure block) rather than sending
        // through platform-owned credentials.
        // A mailbox the customer paused (is_active = false) counts as "no
        // connected mailbox", but the refusal names the real reason.
        const { isMailboxPaused, PAUSED_MAILBOX_MESSAGE } = await import(
          "@/lib/mailbox-active.server"
        );
        const paused = await isMailboxPaused(
          supabaseAdmin,
          message.workspace_id as string,
          account.from_email as string,
        );
        logDispatchDiagnostic({
          ...diagnosticBase,
          phase: "provider_send",
          messageId: message.id,
          mailboxId: account.id,
          mailboxEligible: true,
          reason: paused
            ? "customer_mailbox_paused_for_sender"
            : "no_connected_customer_mailbox_for_sender",
          providerResult: "rejected",
        });
        const { INFRA_NOT_CONFIGURED_MESSAGE: infraMessage } = await import(
          "@/lib/managed-sending.server"
        );
        send = {
          ok: false,
          message: paused ? PAUSED_MAILBOX_MESSAGE : infraMessage,
        } as Awaited<ReturnType<typeof sendManagedEmail>>;
      }
    } catch (error) {
      // A thrown provider/transport error used to leave the row stuck in
      // `processing` forever. Treat it exactly like a failed send.
      await releaseUsage(message.workspace_id as string, "emails_monthly", 1, "send_failed");
      await fail(error instanceof Error ? error.message : "Sending failed.");
      logDispatchDiagnostic({ ...diagnosticBase, phase: "provider_send", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "provider_transport_error", providerResult: "error" });
      continue;
    }

    if (!send.ok) {
      // Give the reserved allowance back: nothing left the platform.
      await releaseUsage(message.workspace_id as string, "emails_monthly", 1, "send_failed");
      const { DOMAIN_NOT_VERIFIED_MESSAGE, INFRA_NOT_CONFIGURED_MESSAGE } = await import(
        "@/lib/managed-sending.server"
      );
      // Infrastructure blocks (domain not ready on the provider, no provider
      // credentials configured) say nothing about the recipient: they are
      // TEMPORARY. Keep the message queued instead of burning it, exactly like
      // the "no mailbox available" path.
      if (send.message === DOMAIN_NOT_VERIFIED_MESSAGE || send.message === INFRA_NOT_CONFIGURED_MESSAGE) {
        result.skipped += 1;
        if (result.errors.length < 5) result.errors.push(send.message);
        await supabase
          .from("campaign_messages")
          .update({
            status: "scheduled",
            scheduled_at: mailboxRetryAt(now, dispatchSchedule.nextWindowStart).toISOString(),
            last_error: send.message,
          })
          .eq("id", message.id);
        logDispatchDiagnostic({ ...diagnosticBase, phase: "provider_send", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "sending_infrastructure_not_ready_deferred", providerResult: "rejected" });
        continue;
      }
      await fail(send.message);
      logDispatchDiagnostic({ ...diagnosticBase, phase: "provider_send", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "provider_rejected", providerResult: "rejected" });
      continue;
    }

    result.sent += 1;
    sentTodaySoFar += 1;
    sentPerAccount.set(account.id, usedNow + 1);
    const sentAt = now.toISOString();

    // The provider accepted the email: record the terminal `sent` state first,
    // with the provider/RFC ids, so no later best-effort step (inbox mirroring,
    // classification) can leave a delivered message stuck in `processing` and
    // missing from campaign statistics.
    const campaignMessagePatch = {
      status: "sent",
      sent_at: sentAt,
      provider: account.provider,
      provider_message_id: send.messageId ?? null,
      message_id: send.rfcMessageId ?? outboundMessageId,
      message_type: "campaign",
      last_error: null,
      attempts: (message.attempts ?? 0) + 1,
    };
    await applySentPatch(supabase, message.id, campaignMessagePatch);

    // Public API subscribers are notified from the queue, never inline: this
    // only enqueues a row and swallows its own failures.
    void enqueueWebhookEvent(
      supabase,
      message.workspace_id as string,
      "email.sent",
      `email.sent:${message.id}`,
      {
        message_id: message.id,
        campaign_id: message.campaign_id,
        lead_id: message.lead_id,
        mailbox_id: account.id,
        to_email: message.to_email,
        subject: message.subject,
        sent_at: sentAt,
      },
    );
    logDispatchDiagnostic({ ...diagnosticBase, phase: "provider_send", messageId: message.id, mailboxId: account.id, mailboxEligible: true, reason: "provider_accepted", providerResult: "accepted" });


    try {
      await recordOutboundCampaignMessage({
        workspaceId: message.workspace_id,
        campaignId: message.campaign_id,
        leadId: message.lead_id,
        campaignMessageId: message.id,
        sendingAccountId: account.id,
        fromEmail: account.from_email,
        fromName: account.from_name,
        toEmail: message.to_email,
        subject: message.subject,
        body: message.body,
        html,
        messageId: send.rfcMessageId ?? outboundMessageId,
        providerMessageId: send.messageId ?? null,
        sentAt,
      });
    } catch {
      /* inbox mirroring must never fail an already delivered send */
    }
    // Explicit classification: provider events for this id can only ever move
    // campaign statistics.
    try {
      const registerOutboundMessage = dependencies.registerOutboundMessage ??
        (await import("@/lib/message-classification.server")).registerOutboundMessage;
      await registerOutboundMessage({
        providerMessageId: send.messageId ?? null,
        messageType: "campaign",
        provider: account.provider,
        workspaceId: message.workspace_id,
        sendingAccountId: account.id,
        toEmail: message.to_email,
        refTable: "campaign_messages",
        refId: message.id,
        alternateProviderMessageIds: [send.rfcMessageId ?? null, outboundMessageId],
      });
    } catch {
      /* classification must never fail an already delivered send */
    }


    if (message.recipient_id) {
      await supabase
        .from("campaign_recipients")
        .update({
          status: "in_progress",
          current_step: message.step_order,
          last_sent_at: sentAt,
          next_send_at: null,
        })
        .eq("id", message.recipient_id);
    }
  }

  // Keep per-mailbox daily counters honest so rotation and caps stay accurate.
  for (const [accountId, count] of sentPerAccount) {
    const account = accountById.get(accountId);
    if (!account) continue;
    await supabase
      .from("sending_accounts")
      .update({
        sent_today: nextStoredSentToday(account, windowStart, count),
        last_sent_at: now.toISOString(),
      })
      .eq("id", accountId);
  }

  // Daily quota reached: park the remaining queue at the next scheduled day's
  // configured start time. The campaign is neither completed nor paused.
  if (quotaDeferralSlot) {
    await supabase
      .from("campaign_messages")
      .update({ scheduled_at: quotaDeferralSlot })
      .eq("campaign_id", options.campaignId)
      .in("status", ["pending", "scheduled"])
      .or(`scheduled_at.is.null,scheduled_at.lte.${now.toISOString()}`);
  }

  return result;

}

/** How many send attempts a single campaign message may ever consume. */
export const MAX_SEND_ATTEMPTS = 3;

export type RetryableMessageRow = {
  id: string;
  status: string;
  attempts: number | null;
  sent_at: string | null;
  bounced_at?: string | null;
  last_error?: string | null;
  provider_message_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

/**
 * Pure selection of failed messages that may be retried on a later sending day.
 *
 * Never returns a message that was accepted (`sent_at`/`provider_message_id`),
 * bounced, cancelled, permanently rejected or already out of attempts — so an
 * accepted email can never be resent and a hard failure is never retried.
 */
export function selectRetryableMessages(
  rows: RetryableMessageRow[],
  dayStart: Date,
  maxAttempts: number = MAX_SEND_ATTEMPTS,
): RetryableMessageRow[] {
  return rows.filter((row) => {
    if (row.status !== "failed") return false;
    if (row.sent_at) return false;
    if (row.provider_message_id) return false;
    if (row.bounced_at) return false;
    if ((row.attempts ?? 0) >= maxAttempts) return false;
    if (!isRetryableFailure(row.last_error ?? null)) return false;
    const last = row.updated_at ?? row.created_at ?? null;
    if (!last) return false;
    const at = new Date(last).getTime();
    // Only retry on a NEW sending day: never re-attempt inside the same run/day.
    return Number.isFinite(at) && at < dayStart.getTime();
  });
}


/**
 * Re-queues previous days' failed messages at the campaign's next configured
 * send slot. Preserves timezone, send days and sending window: it never sends
 * immediately and never touches accepted, cancelled or bounced messages.
 */
export async function requeueRetryableMessages(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
): Promise<number> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, status, timezone, send_days, send_start_hour, send_end_hour, start_at, end_at")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign || !["active", "scheduled"].includes(campaign.status)) return 0;
  const endAt = campaign.end_at ? new Date(campaign.end_at) : null;
  if (endAt && !Number.isNaN(endAt.getTime()) && endAt.getTime() <= now.getTime()) return 0;

  const dayStart = zonedStartOfDay(now, campaign.timezone || "UTC");
  const { data: rows } = await supabase
    .from("campaign_messages")
    .select("id, status, attempts, sent_at, bounced_at, last_error, provider_message_id, updated_at, created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .is("sent_at", null)
    .limit(500);

  const retryable = selectRetryableMessages((rows ?? []) as RetryableMessageRow[], dayStart);
  if (!retryable.length) return 0;

  const slot = windowStartAt(
    campaignScheduleAnchor(campaign as CampaignDispatchRow, now),
    campaignWindow(campaign as CampaignDispatchRow),
    { includeCurrentDay: true },
  ).toISOString();
  await supabase
    .from("campaign_messages")
    .update({ status: "scheduled", scheduled_at: slot, last_error: null })
    .in(
      "id",
      retryable.map((row) => row.id),
    );
  return retryable.length;
}

/**
 * The ONLY completion rule: a campaign is completed when no message can ever
 * be sent again — nothing queued, nothing in flight, and no retryable failure
 * left. Daily quotas, lifetime allowances and mailbox capacity never complete
 * a campaign; they only pause the current run.
 */
export async function finalizeCampaignIfDrained(
  supabase: AnySupabase,
  campaignId: string,
): Promise<boolean> {
  const { count: openCount } = await supabase
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "scheduled", "processing"]);
  if (Number(openCount ?? 0) > 0) return false;

  const { data: failedRows } = await supabase
    .from("campaign_messages")
    .select("id, last_error")
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .is("sent_at", null)
    .limit(500);
  const retryableLeft = ((failedRows ?? []) as { last_error: string | null }[]).some((row) =>
    isRetryableFailure(row.last_error),
  );
  if (retryableLeft) return false;

  const { count: openRecipients } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "in_progress"]);
  if (Number(openRecipients ?? 0) > 0) return false;

  await supabase
    .from("campaigns")
    .update({ status: "completed" })
    .eq("id", campaignId)
    .eq("status", "active");
  return true;
}

/**
 * Queue PLANNING is separate from queue EXECUTION: a valid queue is sent as-is
 * and only replanned when a scheduling input materially changed (window, days,
 * timezone, daily limit, mailbox pool) or when a previous replan was cut short.
 * The fingerprint of those inputs lives in `platform_settings`, so a scheduler
 * tick on an unchanged campaign does no queue-wide work at all.
 */
export async function maybeReplanCampaignQueue(
  supabase: AnySupabase,
  campaignId: string,
  runAt: Date,
  deadlineAt?: Date,
): Promise<{ replanned: boolean; reason: string; updated: number }> {
  const settingKey = `campaign_replan:${campaignId}`;
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("timezone, send_days, send_start_hour, send_end_hour, daily_cap, sending_account_ids")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { replanned: false, reason: "campaign_not_found", updated: 0 };

  const fingerprint = JSON.stringify([
    campaign.timezone ?? "UTC",
    Array.isArray(campaign.send_days) ? [...campaign.send_days].sort() : campaign.send_days ?? null,
    campaign.send_start_hour ?? null,
    campaign.send_end_hour ?? null,
    campaign.daily_cap ?? null,
    Array.isArray(campaign.sending_account_ids) ? [...campaign.sending_account_ids].sort() : [],
  ]);

  const { data: stateRow } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", settingKey)
    .maybeSingle();
  const state = (stateRow?.value ?? null) as { fingerprint?: string; pending?: boolean } | null;
  const changed = state?.fingerprint !== fingerprint;
  const pending = state?.pending === true;
  if (!changed && !pending) {
    console.info("[scheduler] replan skipped", { campaignId, reason: "no_schedule_change" });
    return { replanned: false, reason: "no_schedule_change", updated: 0 };
  }

  const startedAt = Date.now();
  let truncated = false;
  const updated = await rescheduleCampaignQueueBounded(supabase, campaignId, runAt, {
    ...(deadlineAt ? { deadlineAt } : {}),
    onProgress: (info) => {
      truncated = info.truncated;
    },
  });
  await supabase
    .from("platform_settings")
    .upsert({ key: settingKey, value: { fingerprint, pending: truncated } }, { onConflict: "key" });
  console.info("[scheduler] replan done", {
    campaignId,
    reason: changed ? "schedule_changed" : "resume_pending",
    updated,
    truncated,
    durationMs: Date.now() - startedAt,
  });
  return { replanned: true, reason: changed ? "schedule_changed" : "resume_pending", updated };
}

async function rescheduleCampaignQueueBounded(
  supabase: AnySupabase,
  campaignId: string,
  runAt: Date,
  options: { deadlineAt?: Date; onProgress?: (info: { scanned: number; truncated: boolean }) => void },
): Promise<number> {
  const { rescheduleCampaignQueue } = await import("@/lib/campaign-reschedule.server");
  return rescheduleCampaignQueue(supabase, campaignId, runAt, options);
}

/** Send what is due, then queue the follow-ups that became due. */
export async function runCampaign(
  supabase: AnySupabase,
  options: { campaignId: string; limit?: number; force?: boolean; now?: Date; deadlineAt?: Date },
): Promise<DispatchResult> {
  // A recurring campaign continues on the next configured day. Messages that
  // failed on a previous sending day are re-queued once per day so the campaign
  // resumes instead of silently ending with recipients still pending.
  const runAt = options.now ?? new Date();
  const requeued = await requeueRetryableMessages(supabase, options.campaignId, runAt);
  const initialScheduled = await ensureInitialCampaignMessages(supabase, options.campaignId, runAt);

  // Sending FIRST. The whole-queue re-plan rewrites `scheduled_at` for every
  // queued row, so on a large campaign it alone outlives one cron invocation's
  // budget: running it before dispatch consumed the entire budget and the
  // dispatch loop stopped at its very first message, sending nothing forever.
  // Due messages are already legal to send, so they never depend on the replan.
  const result = await dispatchDueMessages(supabase, options);
  result.scheduled += initialScheduled + requeued;

  // Maintenance re-plan: only with budget left over, only when the campaign's
  // schedule inputs actually changed, and never at the cost of the sending it
  // protects. A failure here is reported, not fatal.
  const replanAllowed = !options.deadlineAt || Date.now() < options.deadlineAt.getTime();
  if (replanAllowed) {
    try {
      await maybeReplanCampaignQueue(supabase, options.campaignId, runAt, options.deadlineAt);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Queue re-plan failed");
    }
  } else {
    console.info("[scheduler] replan skipped", { campaignId: options.campaignId, reason: "budget_exhausted" });
  }
  try {
    const followUps = await scheduleFollowUps(supabase, options.campaignId);
    result.scheduled += followUps.scheduled;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Follow-up scheduling failed");
  }
  try {
    await finalizeCampaignIfDrained(supabase, options.campaignId);
  } catch {
    /* completion is a bookkeeping step; never fail a dispatch run for it */
  }
  return result;

}

/** Minutes a message may sit in `processing` before it is reconciled. */
const PROCESSING_STALE_MINUTES = 10;

/**
 * Completes messages stuck in `processing` whose send was actually accepted.
 * The outbound registry row (written right after provider acceptance) is the
 * proof; only those rows are moved to `sent`, so a genuinely failed send is
 * never promoted and statistics cannot double-count.
 */
export async function completeAcceptedProcessingMessages(
  supabase: AnySupabase,
  campaignId: string,
  now: Date = new Date(),
  /** Registry client; defaults to the service-role client. */
  registryClient?: AnySupabase,
): Promise<number> {
  const cutoff = new Date(now.getTime() - PROCESSING_STALE_MINUTES * 60_000).toISOString();
  const { data: stuck } = await supabase
    .from("campaign_messages")
    .select("id, updated_at, created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "processing")
    .is("sent_at", null)
    .lte("created_at", cutoff)
    .limit(200);
  const rows = (stuck ?? []) as { id: string }[];
  if (!rows.length) return 0;

  const admin = registryClient ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data: registry } = await admin
    .from("outbound_messages")
    .select("ref_id, provider_message_id, provider, created_at")
    .eq("ref_table", "campaign_messages")
    .in("ref_id", rows.map((row) => row.id));

  const accepted = new Map<string, { provider_message_id: string | null; provider: string | null; created_at: string | null }>();
  for (const entry of ((registry ?? []) as {
    ref_id: string | null;
    provider_message_id: string | null;
    provider: string | null;
    created_at: string | null;
  }[])) {
    if (entry.ref_id && !accepted.has(entry.ref_id)) accepted.set(entry.ref_id, entry);
  }

  let repaired = 0;
  for (const row of rows) {
    const entry = accepted.get(row.id);
    if (!entry) continue;
    await supabase
      .from("campaign_messages")
      .update({
        status: "sent",
        sent_at: entry.created_at ?? now.toISOString(),
        provider: entry.provider ?? null,
        provider_message_id: entry.provider_message_id ?? null,
        message_type: "campaign",
        last_error: null,
      })
      .eq("id", row.id)
      .eq("status", "processing");
    repaired += 1;
  }
  return repaired;
}
