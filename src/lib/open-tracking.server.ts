/**
 * Recording an open, server side.
 *
 * One raw row per pixel request goes into `email_open_events` (including Apple
 * prefetches, flagged as such), and the message row keeps its own "first opened
 * at" plus raw open count. Genuine (non-prefetch) opens are additionally
 * mirrored ONCE per message into `email_engagement_events`, which is what
 * analytics and the admin screens already read — so an open rate is always
 * unique opens, never raw pixel hits.
 *
 * Every database result is checked. The raw open row is written first and is
 * the durable record; when a later step (count update, analytics mirror) fails
 * the result is reported as `partial_write`, never as success. The mirror is
 * an ignore-duplicate upsert on a stable key, so any later hit for the same
 * message repairs a missing mirror row without double counting.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyOpenRequest, type OpenTrackingTarget } from "@/lib/open-tracking";

type CampaignMessageRow = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  sending_account_id: string | null;
  to_email: string | null;
  opened_at: string | null;
  open_count: number | null;
};

type ConversationMessageRow = {
  id: string;
  workspace_id: string;
  to_email: string | null;
  first_opened_at: string | null;
  open_count: number | null;
};

export type RecordOpenReason = "unknown_message" | "write_failed" | "partial_write";

export type RecordOpenResult = {
  recorded: boolean;
  isPrefetch: boolean;
  reason?: RecordOpenReason;
};

type DbError = { code?: unknown } | null | undefined;

/** Optimistic-concurrency attempts for the raw open counter. */
export const OPEN_COUNT_MAX_ATTEMPTS = 6;

/**
 * Diagnostics carry a fixed stage name and, at most, a Postgres/PostgREST
 * error code. Never the raw error, message text, token, address or secret —
 * database errors can echo row values back.
 */
function logOpenIssue(stage: string, error?: DbError | unknown): void {
  const rawCode = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof rawCode === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(rawCode) ? rawCode : null;
  console.warn(JSON.stringify({ event: "open_pixel_record", stage, code }));
}

class StageError extends Error {
  constructor(readonly stage: string, readonly dbError: DbError) {
    super(stage);
  }
}

/**
 * Raises the raw open count by exactly one without a lost update: the write
 * only applies while the count is still the value just read, and re-reads and
 * retries when a concurrent request got there first. Returns false when the
 * count could not be applied.
 */
async function incrementOpenCount(args: {
  table: "campaign_messages" | "conversation_messages";
  id: string;
  firstOpenColumn: "opened_at" | "first_opened_at";
  isPrefetch: boolean;
  nowIso: string;
  initial: { open_count: number | null; first_open: string | null };
}): Promise<boolean> {
  let current = args.initial;
  for (let attempt = 0; attempt < OPEN_COUNT_MAX_ATTEMPTS; attempt++) {
    const patch: Record<string, unknown> = {
      open_count: (current.open_count ?? 0) + 1,
      // "First opened" means a real reader. A privacy prefetch never sets it.
      ...(args.isPrefetch || current.first_open ? {} : { [args.firstOpenColumn]: args.nowIso }),
      ...(args.table === "campaign_messages" ? { last_event_at: args.nowIso } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (supabaseAdmin.from(args.table) as any).update(patch).eq("id", args.id);
    query = current.open_count == null ? query.is("open_count", null) : query.eq("open_count", current.open_count);
    const { data, error } = await query.select("id");
    if (error) {
      logOpenIssue(`${args.table}_update`, error);
      return false;
    }
    if (Array.isArray(data) && data.length > 0) return true;

    // Lost the race — re-read the latest count and try again.
    const { data: fresh, error: readError } = await supabaseAdmin
      .from(args.table)
      .select(`open_count, ${args.firstOpenColumn}`)
      .eq("id", args.id)
      .maybeSingle();
    if (readError || !fresh) {
      logOpenIssue(`${args.table}_reread`, readError);
      return false;
    }
    const row = fresh as unknown as Record<string, unknown>;
    current = {
      open_count: typeof row["open_count"] === "number" ? (row["open_count"] as number) : null,
      first_open: (row[args.firstOpenColumn] as string | null) ?? null,
    };
  }
  logOpenIssue(`${args.table}_update_contention`);
  return false;
}

/**
 * Records one pixel request. Never throws — the endpoint must always be able to
 * return the image, whatever happens here.
 */
export async function recordOpenHit(args: {
  target: OpenTrackingTarget;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<RecordOpenResult> {
  const { target } = args;
  const classification = classifyOpenRequest({
    userAgent: args.userAgent ?? null,
    ip: args.ip ?? null,
  });
  const isPrefetch = classification.isPrefetch;
  const nowIso = new Date().toISOString();
  const rawEvent = {
    occurred_at: nowIso,
    user_agent: args.userAgent ? args.userAgent.slice(0, 400) : null,
    client_ip: args.ip ? args.ip.slice(0, 80) : null,
    is_prefetch: isPrefetch,
    prefetch_source: classification.source,
  };

  try {
    if (target.messageKind === "campaign") {
      const { data, error: readError } = await supabaseAdmin
        .from("campaign_messages")
        .select(
          "id, workspace_id, campaign_id, lead_id, sending_account_id, to_email, opened_at, open_count",
        )
        .eq("id", target.messageId)
        .maybeSingle();
      if (readError) throw new StageError("campaign_messages_read", readError);
      const row = (data as CampaignMessageRow | null) ?? null;
      // The token is signed, but the message row is the only authority for
      // which workspace / campaign / lead / recipient the open belongs to.
      if (!row || row.workspace_id !== target.workspaceId) {
        return { recorded: false, isPrefetch, reason: "unknown_message" };
      }

      const { error: insertError } = await supabaseAdmin.from("email_open_events").insert({
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        lead_id: row.lead_id,
        message_kind: "campaign",
        message_id: row.id,
        recipient_email: row.to_email,
        ...rawEvent,
      });
      if (insertError) throw new StageError("email_open_events_insert", insertError);

      // From here the raw open is durably stored; failures are partial.
      let complete = await incrementOpenCount({
        table: "campaign_messages",
        id: row.id,
        firstOpenColumn: "opened_at",
        isPrefetch,
        nowIso,
        initial: { open_count: row.open_count, first_open: row.opened_at },
      });
      if (!isPrefetch) {
        const mirrored = await mirrorEngagementOpen(row, nowIso);
        complete = complete && mirrored;
      }
      return complete
        ? { recorded: true, isPrefetch }
        : { recorded: false, isPrefetch, reason: "partial_write" };
    }

    const { data, error: readError } = await supabaseAdmin
      .from("conversation_messages")
      .select("id, workspace_id, to_email, first_opened_at, open_count")
      .eq("id", target.messageId)
      .maybeSingle();
    if (readError) throw new StageError("conversation_messages_read", readError);
    const row = (data as ConversationMessageRow | null) ?? null;
    if (!row || row.workspace_id !== target.workspaceId) {
      return { recorded: false, isPrefetch, reason: "unknown_message" };
    }

    const { error: insertError } = await supabaseAdmin.from("email_open_events").insert({
      workspace_id: row.workspace_id,
      // Conversation opens are never attributed to a campaign/lead from token
      // hints: the signed token proves which message, not which campaign.
      campaign_id: null,
      lead_id: null,
      message_kind: "conversation",
      message_id: row.id,
      recipient_email: row.to_email,
      ...rawEvent,
    });
    if (insertError) throw new StageError("email_open_events_insert", insertError);

    const counted = await incrementOpenCount({
      table: "conversation_messages",
      id: row.id,
      firstOpenColumn: "first_opened_at",
      isPrefetch,
      nowIso,
      initial: { open_count: row.open_count, first_open: row.first_opened_at },
    });
    return counted
      ? { recorded: true, isPrefetch }
      : { recorded: false, isPrefetch, reason: "partial_write" };
  } catch (error) {
    if (error instanceof StageError) logOpenIssue(error.stage, error.dbError);
    else logOpenIssue("unexpected");
    return { recorded: false, isPrefetch, reason: "write_failed" };
  }
}

/**
 * One `opened` engagement row per message, so every existing open metric counts
 * distinct opened messages (and therefore distinct leads per step) rather than
 * raw pixel hits. Returns false when the required analytics row could not be
 * written. Automations are best-effort and never affect the result.
 */
async function mirrorEngagementOpen(row: CampaignMessageRow, nowIso: string): Promise<boolean> {
  let mirrored = false;
  try {
    const { error } = await supabaseAdmin.from("email_engagement_events").upsert(
      {
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        sending_account_id: row.sending_account_id,
        message_id: row.id,
        lead_id: row.lead_id,
        recipient_email: row.to_email,
        event_type: "opened",
        provider: "munchreach_pixel",
        external_id: `open:pixel:${row.id}`,
        occurred_at: nowIso,
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    );
    if (error) logOpenIssue("email_engagement_events_upsert", error);
    else mirrored = true;
  } catch (error) {
    logOpenIssue("email_engagement_events_upsert", error);
  }
  // Only emit once the analytics row exists, so automations never run for an
  // open that analytics does not show.
  if (!mirrored) return false;

  try {
    const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
    await emitAutomationEvent({
      workspaceId: row.workspace_id,
      type: "email.opened",
      leadId: row.lead_id,
      campaignId: row.campaign_id,
      idempotencyKey: `email.opened:open:pixel:${row.id}`,
      payload: { email: row.to_email },
    });
  } catch (error) {
    logOpenIssue("automation_emit", error);
  }
  return true;
}
