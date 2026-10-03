/**
 * Automation events emitted by the campaign sending engine.
 *
 * Thin adapters over the ONE automation event system (`emitAutomationEvent`):
 * they build the stable idempotency key and never throw, so sending and
 * campaign bookkeeping can never fail because of an automation.
 *
 * - `email.sent` fires only after the provider accepted the email AND the
 *   terminal `sent` row was written. Queued, pending, failed, retried or
 *   unknown outcomes never reach this function.
 * - `campaign.completed` fires only when the existing completion rule flipped
 *   the campaign from `active` to `completed` (the conditional update matched
 *   a row), so a second pass over an already-completed campaign emits nothing.
 *
 * Duplicate delivery is absorbed by `automation_events`' unique idempotency
 * key, so the same email or completion never starts the same workflow twice.
 */
type Emit = (args: {
  workspaceId: string;
  type: string;
  idempotencyKey: string;
  leadId?: string | null;
  campaignId?: string | null;
  payload?: Record<string, unknown>;
}) => Promise<unknown>;

async function defaultEmit(): Promise<Emit> {
  return (await import("@/lib/automation-engine.server")).emitAutomationEvent as Emit;
}

export function emailSentEventKey(campaignMessageId: string) {
  return `email.sent:${campaignMessageId}`;
}

export function campaignCompletedEventKey(campaignId: string) {
  return `campaign.completed:${campaignId}`;
}

export async function emitEmailSentAutomation(
  message: { id: string; workspace_id: string; campaign_id: string | null; lead_id: string | null; to_email?: string | null; subject?: string | null },
  details: { mailboxId: string; sentAt: string },
  emit?: Emit,
): Promise<void> {
  try {
    const fn = emit ?? (await defaultEmit());
    await fn({
      workspaceId: message.workspace_id,
      type: "email.sent",
      idempotencyKey: emailSentEventKey(message.id),
      leadId: message.lead_id,
      campaignId: message.campaign_id,
      payload: { mailboxId: details.mailboxId, sentAt: details.sentAt, subject: message.subject ?? null },
    });
  } catch {
    /* automations must never affect a delivered send */
  }
}

export async function emitCampaignCompletedAutomation(
  rows: { id: string; workspace_id: string }[] | null | undefined,
  reason: "drained" | "end_date",
  emit?: Emit,
): Promise<void> {
  for (const row of rows ?? []) {
    if (!row?.id || !row?.workspace_id) continue;
    try {
      const fn = emit ?? (await defaultEmit());
      await fn({
        workspaceId: row.workspace_id,
        type: "campaign.completed",
        idempotencyKey: campaignCompletedEventKey(row.id),
        campaignId: row.id,
        payload: { reason },
      });
    } catch {
      /* completion bookkeeping never fails because of automations */
    }
  }
}
