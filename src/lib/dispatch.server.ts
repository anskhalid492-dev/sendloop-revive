/**
 * Server-only sending engine shared by the in-app "Send due now" action and the
 * automatic campaign runner (cron endpoint).
 *
 * Two responsibilities:
 *  - `dispatchDueMessages`: turn queued `campaign_messages` into real emails.
 *  - `scheduleFollowUps`: walk each recipient through the sequence, materialising
 *    the next email step once its delay has elapsed.
 */
import { nextSendSlot } from "@/lib/campaign-schedule";
import {
  renderTemplate,
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

export function emptyResult(): DispatchResult {
  return { processed: 0, sent: 0, failed: 0, skipped: 0, scheduled: 0, errors: [] };
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

/** Total delay in ms configured on a step. */
function stepDelayMs(step: StepRow): number {
  return (
    (step.wait_days ?? 0) * 86_400_000 +
    (step.wait_hours ?? 0) * 3_600_000 +
    (step.delay_minutes ?? 0) * 60_000
  );
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
      "id, workspace_id, status, timezone, send_days, send_start_hour, send_end_hour, custom_variables, stop_on_reply",
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

  const { data: recipients } = await supabase
    .from("campaign_recipients")
    .select("id, lead_id, status, current_step, sending_account_id, last_sent_at")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "in_progress"]);
  if (!recipients?.length) return { scheduled: 0, completed: 0 };

  const recipientIds = recipients.map((r: { id: string }) => r.id);
  const { data: messages } = await supabase
    .from("campaign_messages")
    .select("recipient_id, step_order, status, sent_at")
    .eq("campaign_id", campaignId)
    .in("recipient_id", recipientIds);

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
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
    )
    .in("id", leadIds);
  const leadById = new Map((leads ?? []).map((l: { id: string }) => [l.id, l] as const));

  const variables = (campaign.custom_variables ?? []) as CustomVariable[];
  const window = {
    timezone: campaign.timezone,
    sendDays: campaign.send_days,
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
    const slot = nextSendSlot(dueAt, window).toISOString();

    inserts.push({
      workspace_id: campaign.workspace_id,
      campaign_id: campaignId,
      recipient_id: recipient.id,
      lead_id: recipient.lead_id,
      step_id: next.id,
      sending_account_id: recipient.sending_account_id,
      step_order: next.step_order,
      status: "scheduled",
      to_email: (lead as { email: string }).email,
      subject: renderTemplate(resolveSpintax(next.subject), lead as never, variables),
      body: renderTemplate(resolveSpintax(next.body), lead as never, variables),
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

/** Send every due message of a campaign through its mailbox provider. */
export async function dispatchDueMessages(
  supabase: AnySupabase,
  options: { campaignId: string; limit?: number; force?: boolean },
): Promise<DispatchResult> {
  const { getAdapter, readCredentials } = await import("./providers/adapter.server");
  const { recordOutboundCampaignMessage } = await import("./inbox.server");
  const { resolveReplyTo } = await import("./inbox-send.server");
  const { mintReplyAddress } = await import("./inbound-routing.server");
  const { suppressedSet } = await import("./suppression.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const limit = options.limit ?? 10;
  const now = new Date();
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

  const result = emptyResult();
  if (!due?.length) return result;

  // Bounced, complained and unsubscribed addresses are never emailed again.
  const suppressed = await suppressedSet(
    due[0].workspace_id,
    due.map((m: { to_email: string }) => m.to_email),
  );

  const accountIds = [
    ...new Set(due.map((m: { sending_account_id: string | null }) => m.sending_account_id).filter(Boolean)),
  ] as string[];
  const { data: accounts, error: aErr } = await supabase
    .from("sending_accounts")
    .select(
      "id, provider, provider_id, from_name, from_email, reply_to, sent_today, daily_limit, paused, customer_enabled, status",
    )
    .in("id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);
  if (aErr) throw new Error(aErr.message);
  const accountById = new Map(
    ((accounts ?? []) as AccountRow[]).map((a) => [a.id, a] as const),
  );

  // Provider credentials are admin-owned infrastructure, read with the service
  // client after the caller's workspace access has already been checked.
  const providerIds = [
    ...new Set((accounts ?? []).map((a: { provider_id: string | null }) => a.provider_id).filter(Boolean)),
  ] as string[];
  const credentialsByProvider = new Map<string, Record<string, string>>();
  // Customer-owned mailboxes carry their own encrypted credentials.
  const credentialsByAccount = new Map<string, Record<string, string>>();
  if (accountIds.length) {
    const { data: ownSecrets } = await supabaseAdmin
      .from("sending_account_secrets")
      .select("sending_account_id, credentials_ciphertext")
      .in("sending_account_id", accountIds);
    for (const row of ownSecrets ?? []) {
      try {
        credentialsByAccount.set(row.sending_account_id, readCredentials(row.credentials_ciphertext));
      } catch {
        /* unreadable credentials surface as a per-message failure below */
      }
    }
  }
  if (providerIds.length) {
    const { data: secrets } = await supabaseAdmin
      .from("email_provider_secrets")
      .select("provider_id, credentials_ciphertext")
      .in("provider_id", providerIds);
    for (const row of secrets ?? []) {
      try {
        credentialsByProvider.set(row.provider_id, readCredentials(row.credentials_ciphertext));
      } catch {
        /* unreadable credentials surface as a per-message failure below */
      }
    }
  }

  const sentPerAccount = new Map<string, number>();

  for (const message of due) {
    result.processed += 1;
    const account = message.sending_account_id
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
      continue;
    }

    if (!account) {
      await fail("No mailbox assigned to this message.");
      continue;
    }
    if (account.paused || !account.customer_enabled || account.status === "disabled") {
      result.skipped += 1;
      continue;
    }
    const credentials =
      credentialsByAccount.get(account.id) ??
      (account.provider_id ? (credentialsByProvider.get(account.provider_id) ?? null) : null);
    const envFallback = account.provider === "resend" && Boolean(process.env["RESEND_API_KEY"]);
    if (!credentials && !envFallback) {
      await fail("The mailbox provider has no credentials configured.");
      continue;
    }
    const usedNow = sentPerAccount.get(account.id) ?? 0;
    if ((account.sent_today ?? 0) + usedNow >= (account.daily_limit ?? 0)) {
      result.skipped += 1;
      continue;
    }

    await supabase.from("campaign_messages").update({ status: "processing" }).eq("id", message.id);

    const adapter = getAdapter(account.provider);
    // Replies must reach the inbox Sendloop tracks, not the raw mailbox.
    const baseReplyTo = await resolveReplyTo(account.provider_id, account.reply_to);
    // A unique routed address per send: replies come back tagged with the
    // workspace, mailbox, lead and campaign they belong to.
    const replyTo = await mintReplyAddress(baseReplyTo, {
      workspaceId: message.workspace_id,
      sendingAccountId: account.id,
      leadId: message.lead_id,
      campaignId: message.campaign_id,
      purpose: "campaign",
    });
    const send = await adapter.sendEmail(credentials ?? {}, {
      fromName: account.from_name,
      fromEmail: account.from_email,
      replyTo,
      to: message.to_email,
      subject: message.subject,
      text: message.body,
    });

    if (!send.ok) {
      await fail(send.message);
      continue;
    }

    result.sent += 1;
    sentPerAccount.set(account.id, usedNow + 1);
    const sentAt = new Date().toISOString();
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
        providerMessageId: send.messageId ?? null,
        sentAt,
      });
    } catch {
      /* inbox mirroring must never fail an already delivered send */
    }
    await supabase
      .from("campaign_messages")
      .update({
        status: "sent",
        sent_at: sentAt,
        provider: account.provider,
        provider_message_id: send.messageId ?? null,
        last_error: null,
        attempts: (message.attempts ?? 0) + 1,
      })
      .eq("id", message.id);

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
    await supabase
      .from("sending_accounts")
      .update({ sent_today: (account?.sent_today ?? 0) + count })
      .eq("id", accountId);
  }

  return result;
}

/** Send what is due, then queue the follow-ups that became due. */
export async function runCampaign(
  supabase: AnySupabase,
  options: { campaignId: string; limit?: number; force?: boolean },
): Promise<DispatchResult> {
  const result = await dispatchDueMessages(supabase, options);
  try {
    const followUps = await scheduleFollowUps(supabase, options.campaignId);
    result.scheduled = followUps.scheduled;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Follow-up scheduling failed");
  }
  return result;
}
