/**
 * Delivery reconciliation.
 *
 * Webhooks can be missed (endpoint down, provider retry exhausted, event sent
 * before the send row was written). Every few minutes this runner asks the
 * sending infrastructure for the current state of recent sends whose outcome
 * is still unknown, and folds the answer through the same idempotent state
 * machine the webhooks use — so recovery can never double-count.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyDeliveryState, type DeliveryState } from "@/lib/delivery-state.server";

type ResendEmail = {
  last_event?: string | null;
  created_at?: string | null;
};

const RESEND_EVENT_MAP: Record<string, DeliveryState> = {
  sent: "sent",
  queued: "sent",
  scheduled: "sent",
  delivery_delayed: "delayed",
  delivered: "delivered",
  opened: "opened",
  clicked: "clicked",
  bounced: "bounced",
  complained: "complained",
  failed: "failed",
  canceled: "failed",
};

async function resendApiKey(provider: string): Promise<string | null> {
  const { loadPool, credentialsFor } = await import("@/lib/provider-pool.server");
  const pool = await loadPool(supabaseAdmin);
  const row = pool.find((p) => p.provider === provider);
  if (!row) return null;
  const creds = await credentialsFor(supabaseAdmin, row);
  const key = creds?.credentials as { api_key?: string } | undefined;
  return key?.api_key ?? null;
}

/** Pulls provider-side state for recent sends that have no terminal outcome. */
export async function reconcileDeliveryState(limit = 100): Promise<{
  checked: number;
  updated: number;
  skipped: number;
  repaired: number;
}> {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // First, self-heal from signals we already stored: an event row whose state
  // never landed on its message (webhook raced the send row, or an older event
  // arrived out of order) is folded back in. Idempotent, so it is safe to run
  // on every pass and it repairs historic campaign statistics.
  let repaired = 0;
  {
    const { data } = await supabaseAdmin.rpc("repair_delivery_state" as never, {
      _workspace_id: null,
      _since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    } as never);
    repaired = Number(data ?? 0);
  }

  // Then re-run recent tracking events that previously raced the send commit.
  // This is bounded and idempotent: unowned provider traffic stays failed after
  // a few attempts, while valid late-visible sends repair themselves.
  const { data: retryableEvents } = await supabaseAdmin
    .from("email_events")
    .select("id")
    .eq("status", "failed")
    .in("failure_code", ["provider_message_id_not_found", "campaign_message_not_found"])
    .in("event_type", ["sent", "delivered", "opened", "clicked", "delayed", "failed", "rejected", "bounced", "complained", "unsubscribed"])
    .lt("attempts", 3)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, 50));

  if (retryableEvents?.length) {
    const { retryStoredEvent } = await import("@/lib/email-events.server");
    for (const event of retryableEvents as Array<{ id: string }>) {
      const result = await retryStoredEvent(event.id, false, null, "auto_retry");
      if (result.status !== "failed" && result.status !== "unmatched") repaired += 1;
    }
  }

  const { data: rows } = await supabaseAdmin
    .from("campaign_messages")
    .select("id, status, delivery_status, provider, provider_message_id, sent_at")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .gte("sent_at", since)
    .in("delivery_status", ["queued", "sent", "delayed"])
    .order("sent_at", { ascending: false })
    .limit(limit);

  const messages = rows ?? [];
  let updated = 0;
  let skipped = 0;
  const keys = new Map<string, string | null>();

  for (const message of messages) {
    const provider = message.provider ?? "resend";
    if (provider !== "resend") {
      // Other providers report exclusively through webhooks today.
      skipped += 1;
      continue;
    }
    if (!keys.has(provider)) keys.set(provider, await resendApiKey(provider));
    const apiKey = keys.get(provider);
    if (!apiKey) {
      skipped += 1;
      continue;
    }

    try {
      const res = await fetch(`https://api.resend.com/emails/${message.provider_message_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        skipped += 1;
        continue;
      }
      const body = (await res.json()) as ResendEmail;
      const state = RESEND_EVENT_MAP[String(body.last_event ?? "").toLowerCase()];
      if (!state) {
        skipped += 1;
        continue;
      }
      const applied = await applyDeliveryState({
        message,
        state,
        detail: `Recovered from delivery log (${body.last_event})`,
        source: "reconcile",
      });
      if (applied === state && state !== (message.delivery_status ?? "queued")) updated += 1;
    } catch {
      skipped += 1;
    }
  }

  return { checked: messages.length, updated, skipped, repaired };
}
