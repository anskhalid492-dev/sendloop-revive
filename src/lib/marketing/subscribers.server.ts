/**
 * Marketing subscriber store and product-signal projection (server-only).
 *
 * The marketing subscriber list is a SEPARATE audience from MunchReach app
 * users: a subscriber may be a newsletter reader with no account, and a user
 * account is only linked when we can match one. Nothing here writes to the
 * product tables — product state is read and projected on demand so a segment
 * can never operate on a stale copy.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { MarketingSubscriber, SubscriberProfile, SubscriberStatus } from "./types";
import type { ProductEvent } from "./events";

type SubscriberRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  user_id: string | null;
  source: string;
  tags: string[] | null;
  status: string;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  last_sent_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  created_at: string;
  updated_at: string;
};

export function toSubscriber(row: SubscriberRow): MarketingSubscriber {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    userId: row.user_id,
    source: row.source,
    tags: row.tags ?? [],
    status: row.status as SubscriberStatus,
    subscribedAt: row.subscribed_at,
    unsubscribedAt: row.unsubscribed_at,
    lastSentAt: row.last_sent_at,
    lastOpenedAt: row.last_opened_at,
    lastClickedAt: row.last_clicked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type UpsertSubscriberInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  userId?: string | null;
  source?: string;
  tags?: string[];
};

/**
 * Adds or updates a subscriber. A previously unsubscribed or suppressed
 * address is NEVER silently reactivated here — opting back in is an explicit
 * action, not a side effect of an import or a form submission.
 */
export async function upsertSubscriber(
  input: UpsertSubscriberInput,
): Promise<{ subscriber: MarketingSubscriber; created: boolean }> {
  const email = normalizeEmail(input.email);
  const { data: existing } = await supabaseAdmin
    .from("marketing_subscribers")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const row = existing as SubscriberRow;
    const tags = [...new Set([...(row.tags ?? []), ...(input.tags ?? [])])];
    const { data, error } = await supabaseAdmin
      .from("marketing_subscribers")
      .update({
        first_name: input.firstName ?? row.first_name,
        last_name: input.lastName ?? row.last_name,
        user_id: input.userId ?? row.user_id,
        tags,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { subscriber: toSubscriber(data as SubscriberRow), created: false };
  }

  const suppressed = await isSuppressed(email);
  const { data, error } = await supabaseAdmin
    .from("marketing_subscribers")
    .insert({
      email,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      user_id: input.userId ?? null,
      source: input.source ?? "manual",
      tags: input.tags ?? [],
      status: suppressed ? "suppressed" : "active",
      subscribed_at: suppressed ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { subscriber: toSubscriber(data as SubscriberRow), created: true };
}

export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("marketing_suppression")
    .select("id")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  return Boolean(data);
}

export async function suppressedSet(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const set = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500).map(normalizeEmail);
    const { data } = await supabaseAdmin
      .from("marketing_suppression")
      .select("email")
      .in("email", chunk);
    for (const row of (data ?? []) as { email: string }[]) set.add(row.email);
  }
  return set;
}

export async function suppressEmail(args: {
  email: string;
  reason: "unsubscribe" | "bounce" | "complaint" | "manual";
  source: string;
  detail?: string;
}): Promise<void> {
  const email = normalizeEmail(args.email);
  const { error: suppressionError } = await supabaseAdmin.from("marketing_suppression").upsert(
    {
      email,
      reason: args.reason,
      source: args.source,
      detail: args.detail ?? null,
    },
    { onConflict: "email" },
  );
  if (suppressionError) throw new Error(`Could not record opt-out: ${suppressionError.message}`);
  const status: SubscriberStatus =
    args.reason === "bounce"
      ? "bounced"
      : args.reason === "complaint"
        ? "complained"
        : args.reason === "unsubscribe"
          ? "unsubscribed"
          : "suppressed";
  const { error: subscriberError } = await supabaseAdmin
    .from("marketing_subscribers")
    .update({ status, unsubscribed_at: new Date().toISOString() })
    .eq("email", email);
  if (subscriberError) throw new Error(`Could not update subscriber: ${subscriberError.message}`);
}

/** Explicit opt-back-in; only ever triggered by the subscriber or an admin. */
export async function resubscribeEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  await supabaseAdmin.from("marketing_suppression").delete().eq("email", normalized);
  await supabaseAdmin
    .from("marketing_subscribers")
    .update({
      status: "active",
      unsubscribed_at: null,
      subscribed_at: new Date().toISOString(),
    })
    .eq("email", normalized);
}

/* ------------------------------------------------------ product projection */

type Counter = { count: number; lastAt: string | null };

function bump(target: Partial<Record<ProductEvent, Counter>>, event: ProductEvent, at: string | null) {
  const current = target[event] ?? { count: 0, lastAt: null };
  current.count += 1;
  if (at && (!current.lastAt || at > current.lastAt)) current.lastAt = at;
  target[event] = current;
}

/**
 * Builds segmentation profiles for a set of subscribers.
 *
 * Product signals are projected from the live product tables (profiles,
 * workspaces, subscriptions, campaigns, sending accounts, replies) rather
 * than duplicated into the marketing schema.
 */
export async function loadSubscriberProfiles(
  subscribers: MarketingSubscriber[],
): Promise<SubscriberProfile[]> {
  if (subscribers.length === 0) return [];
  const userIds = [...new Set(subscribers.map((s) => s.userId).filter((v): v is string => !!v))];
  const emails = subscribers.map((s) => s.email);

  const profilesByUser = new Map<string, { created_at: string }>();
  const workspacesByUser = new Map<string, string[]>();
  const lastLoginByUser = new Map<string, string>();
  const planByWorkspace = new Map<string, { status: string; created_at: string }>();
  const eventsByUser = new Map<string, Partial<Record<ProductEvent, Counter>>>();

  if (userIds.length > 0) {
    const [{ data: profiles }, { data: workspaces }, { data: members }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, created_at").in("id", userIds),
      supabaseAdmin.from("workspaces").select("id, owner_id, created_at").in("owner_id", userIds),
      supabaseAdmin
        .from("workspace_members")
        .select("user_id, workspace_id, last_active_at")
        .in("user_id", userIds),
    ]);

    for (const row of (profiles ?? []) as { id: string; created_at: string }[]) {
      profilesByUser.set(row.id, { created_at: row.created_at });
    }
    for (const row of (workspaces ?? []) as { id: string; owner_id: string }[]) {
      const list = workspacesByUser.get(row.owner_id) ?? [];
      list.push(row.id);
      workspacesByUser.set(row.owner_id, list);
    }
    for (const row of (members ?? []) as {
      user_id: string;
      workspace_id: string;
      last_active_at: string | null;
    }[]) {
      const list = workspacesByUser.get(row.user_id) ?? [];
      if (!list.includes(row.workspace_id)) list.push(row.workspace_id);
      workspacesByUser.set(row.user_id, list);
      const current = lastLoginByUser.get(row.user_id);
      if (row.last_active_at && (!current || row.last_active_at > current)) {
        lastLoginByUser.set(row.user_id, row.last_active_at);
      }
    }

    const workspaceIds = [...new Set([...workspacesByUser.values()].flat())];
    if (workspaceIds.length > 0) {
      const [{ data: subs }, { data: campaigns }, { data: accounts }, { data: replies }] =
        await Promise.all([
          supabaseAdmin
            .from("workspace_subscriptions")
            .select("workspace_id, status, created_at")
            .in("workspace_id", workspaceIds),
          supabaseAdmin
            .from("campaigns")
            .select("workspace_id, created_at, launched_at, emails_sent_count, status")
            .in("workspace_id", workspaceIds),
          supabaseAdmin
            .from("sending_accounts")
            .select("workspace_id, created_at")
            .in("workspace_id", workspaceIds),
          supabaseAdmin
            .from("campaign_replies")
            .select("workspace_id, received_at")
            .in("workspace_id", workspaceIds)
            .limit(2000),
        ]);

      for (const row of (subs ?? []) as {
        workspace_id: string;
        status: string;
        created_at: string;
      }[]) {
        planByWorkspace.set(row.workspace_id, { status: row.status, created_at: row.created_at });
      }

      const ownerOf = new Map<string, string>();
      for (const [userId, list] of workspacesByUser) {
        for (const workspaceId of list) if (!ownerOf.has(workspaceId)) ownerOf.set(workspaceId, userId);
      }
      const eventsFor = (workspaceId: string) => {
        const userId = ownerOf.get(workspaceId);
        if (!userId) return null;
        const bucket = eventsByUser.get(userId) ?? {};
        eventsByUser.set(userId, bucket);
        return bucket;
      };

      for (const row of (campaigns ?? []) as {
        workspace_id: string;
        created_at: string;
        launched_at: string | null;
        emails_sent_count: number | null;
      }[]) {
        const bucket = eventsFor(row.workspace_id);
        if (!bucket) continue;
        bump(bucket, "campaign_created", row.created_at);
        if (row.launched_at) bump(bucket, "campaign_launched", row.launched_at);
        if ((row.emails_sent_count ?? 0) > 0) bump(bucket, "first_email_sent", row.launched_at);
      }
      for (const row of (accounts ?? []) as { workspace_id: string; created_at: string }[]) {
        const bucket = eventsFor(row.workspace_id);
        if (bucket) bump(bucket, "mailbox_connected", row.created_at);
      }
      for (const row of (replies ?? []) as { workspace_id: string; received_at: string | null }[]) {
        const bucket = eventsFor(row.workspace_id);
        if (bucket) bump(bucket, "first_reply_received", row.received_at);
      }
    }
  }

  const marketingCounters = await loadMarketingCounters(emails);

  return subscribers.map((subscriber) => {
    const userId = subscriber.userId;
    const workspaceIds = userId ? (workspacesByUser.get(userId) ?? []) : [];
    const plans = workspaceIds
      .map((id) => planByWorkspace.get(id))
      .filter((v): v is { status: string; created_at: string } => !!v);
    const statuses = plans.map((p) => p.status);

    let subscriptionStatus: SubscriberProfile["subscriptionStatus"] = null;
    if (userId) {
      if (statuses.some((s) => s === "active" || s === "past_due")) subscriptionStatus = "active";
      else if (statuses.some((s) => s === "trialing" || s === "trial")) subscriptionStatus = "trial";
      else if (statuses.some((s) => s === "cancelled" || s === "canceled"))
        subscriptionStatus = "cancelled";
      else subscriptionStatus = "free";
    }

    const events: Partial<Record<ProductEvent, Counter>> = userId
      ? { ...(eventsByUser.get(userId) ?? {}) }
      : {};
    const signedUpAt = userId ? (profilesByUser.get(userId)?.created_at ?? null) : null;
    if (signedUpAt) events.user_signed_up = { count: 1, lastAt: signedUpAt };
    if (subscriptionStatus === "active") {
      const started = plans.find((p) => p.status === "active")?.created_at ?? null;
      events.subscription_started = { count: 1, lastAt: started };
    }
    if (subscriptionStatus === "cancelled") {
      events.subscription_cancelled = { count: 1, lastAt: null };
    }

    return {
      id: subscriber.id,
      email: subscriber.email,
      status: subscriber.status,
      source: subscriber.source,
      tags: subscriber.tags,
      createdAt: subscriber.createdAt,
      subscriptionStatus,
      signedUpAt,
      lastLoginAt: userId ? (lastLoginByUser.get(userId) ?? null) : null,
      events,
      marketing: marketingCounters.get(subscriber.email) ?? { sent: 0, opened: 0, clicked: 0 },
    } satisfies SubscriberProfile;
  });
}

async function loadMarketingCounters(
  emails: string[],
): Promise<Map<string, { sent: number; opened: number; clicked: number }>> {
  const map = new Map<string, { sent: number; opened: number; clicked: number }>();
  if (emails.length === 0) return map;
  for (let i = 0; i < emails.length; i += 300) {
    const chunk = emails.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from("marketing_email_events")
      .select("email, event_type")
      .in("email", chunk)
      .in("event_type", [
        "marketing_email_sent",
        "marketing_email_opened",
        "marketing_email_clicked",
      ]);
    for (const row of (data ?? []) as { email: string; event_type: string }[]) {
      const entry = map.get(row.email) ?? { sent: 0, opened: 0, clicked: 0 };
      if (row.event_type === "marketing_email_sent") entry.sent += 1;
      if (row.event_type === "marketing_email_opened") entry.opened += 1;
      if (row.event_type === "marketing_email_clicked") entry.clicked += 1;
      map.set(row.email, entry);
    }
  }
  return map;
}

/** Marketing sends per subscriber in the last 24h / 7d, for frequency capping. */
export async function loadFrequencyState(
  emails: string[],
  now: Date = new Date(),
): Promise<Map<string, { sentLast24h: number; sentLast7d: number }>> {
  const map = new Map<string, { sentLast24h: number; sentLast7d: number }>();
  if (emails.length === 0) return map;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  for (let i = 0; i < emails.length; i += 300) {
    const chunk = emails.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from("marketing_email_events")
      .select("email, created_at")
      .eq("event_type", "marketing_email_sent")
      .in("email", chunk)
      .gte("created_at", weekAgo);
    for (const row of (data ?? []) as { email: string; created_at: string }[]) {
      const entry = map.get(row.email) ?? { sentLast24h: 0, sentLast7d: 0 };
      entry.sentLast7d += 1;
      if (row.created_at >= dayAgo) entry.sentLast24h += 1;
      map.set(row.email, entry);
    }
  }
  return map;
}
