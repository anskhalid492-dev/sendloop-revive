/**
 * Read-only endpoints: mailboxes, replies and workspace analytics.
 *
 * These never expose provider credentials, secret ciphertext or internal
 * routing state — the serializers pick the public fields explicitly.
 */
import { z } from "zod";

import { ApiError } from "../errors";
import { decodeCursor, paginate, parseLimit } from "../pagination";
import { serializeMailbox, serializeReply } from "../serializers";
import type { ApiContext } from "../runtime.server";
import { parseQuery, pathId } from "../validate";

const MAILBOX_FIELDS =
  "id, workspace_id, label, from_email, from_name, reply_to, provider, status, paused, customer_enabled, health_score, auth_status, spf_status, dkim_status, dmarc_status, mx_status, last_error, last_tested_at, daily_limit, hourly_limit, sent_today, last_sent_at, warmup_status, warmup_daily_target, warmup_started_at, created_at, updated_at";

export async function listMailboxes(ctx: ApiContext) {
  const q = parseQuery(
    z.object({ limit: z.string().optional(), cursor: z.string().optional() }).passthrough(),
    ctx.url,
  );
  const limit = parseLimit(q.limit ?? null);

  let query = ctx.admin
    .from("sending_accounts")
    .select(MAILBOX_FIELDS)
    .eq("workspace_id", ctx.auth.workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (q.cursor) {
    const cursor = decodeCursor(q.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not list mailboxes.");
  const page = paginate(data ?? [], limit, (row: { created_at: string; id: string }) => ({
    createdAt: row.created_at,
    id: row.id,
  }));
  return { object: "list", ...page, data: page.data.map(serializeMailbox) };
}

export async function getMailbox(ctx: ApiContext) {
  const id = pathId(ctx.params["mailboxId"], "mailbox id");
  const { data } = await ctx.admin
    .from("sending_accounts")
    .select(MAILBOX_FIELDS)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .maybeSingle();
  if (!data) throw new ApiError("mailbox_not_found", "No mailbox with that id exists.");
  return { data: serializeMailbox(data) };
}

export async function listReplies(ctx: ApiContext) {
  const q = parseQuery(
    z
      .object({
        limit: z.string().optional(),
        cursor: z.string().optional(),
        campaign_id: z.string().uuid().optional(),
        since: z.string().datetime().optional(),
      })
      .passthrough(),
    ctx.url,
  );
  const limit = parseLimit(q.limit ?? null);

  let query = ctx.admin
    .from("conversation_messages")
    .select(
      "id, conversation_id, from_email, from_name, to_email, subject, body, html, occurred_at, created_at, conversation:conversations!inner(campaign_id, lead_id, workspace_id)",
    )
    .eq("workspace_id", ctx.auth.workspaceId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (q.campaign_id) query = query.eq("conversations.campaign_id", q.campaign_id);
  if (q.since) query = query.gte("occurred_at", q.since);
  if (q.cursor) {
    const cursor = decodeCursor(q.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not list replies.");
  const page = paginate(data ?? [], limit, (row: { created_at: string; id: string }) => ({
    createdAt: row.created_at,
    id: row.id,
  }));
  return { object: "list", ...page, data: page.data.map(serializeReply) };
}

export async function workspaceAnalytics(ctx: ApiContext) {
  const q = parseQuery(
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .passthrough(),
    ctx.url,
  );
  const from = q.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const to = q.to ?? new Date().toISOString();

  // One shared, distinct-message-ID outcome classification (src/lib/message-outcomes.ts).
  const { fetchAllRows } = await import("@/lib/supabase-batch");
  const { countMessageOutcomes } = await import("@/lib/message-outcomes");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>(() =>
    (ctx.admin as any)
      .from("campaign_messages")
      .select("id, status, delivery_status, sent_at, delivered_at, bounced_at, failed_at, last_error, attempts, updated_at, opened_at, clicked_at")
      .eq("workspace_id", ctx.auth.workspaceId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("id", { ascending: true }),
  );
  const outcomes = countMessageOutcomes(rows);
  const sent = outcomes.providerAccepted;
  const delivered = outcomes.delivered;
  const bounced = outcomes.bounced;
  const failed = outcomes.failed;
  const opened = rows.filter((r) => r.opened_at).length;
  const clicked = rows.filter((r) => r.clicked_at).length;
  const replies = await (async () => {
    const { count } = await ctx.admin
      .from("campaign_replies")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.auth.workspaceId)
      .gte("created_at", from)
      .lte("created_at", to);
    return count ?? 0;
  })();

  const rate = (part: number) => (sent > 0 ? Number(((part / sent) * 100).toFixed(2)) : 0);

  return {
    data: {
      object: "analytics",
      period: { from, to },
      totals: { sent, accepted: outcomes.accepted, delivered, opened, clicked, bounced, failed, held: outcomes.held, cancelled: outcomes.cancelled, queued: outcomes.queued + outcomes.sending, replies },
      rates: {
        delivery_rate: rate(delivered),
        open_rate: rate(opened),
        click_rate: rate(clicked),
        reply_rate: rate(replies),
        bounce_rate: rate(bounced),
      },
    },
  };
}
