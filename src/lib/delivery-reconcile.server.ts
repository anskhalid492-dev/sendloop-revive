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
import { getEmailProvider } from "@/lib/email-providers/registry.server";
import type {
  EmailProviderCapability,
  EmailProviderCredentials,
  NormalizedEmailEventType,
} from "@/lib/email-providers/types";

/**
 * Normalized provider vocabulary → MunchReach delivery state. Provider-native
 * event names never reach this layer: adapters translate them first.
 * `UNKNOWN` deliberately has no mapping — an unrecognized signal is never
 * upgraded into a delivery or engagement event.
 */
const STATE_BY_EVENT: Partial<Record<NormalizedEmailEventType, DeliveryState>> = {
  SENT: "sent",
  ACCEPTED: "sent",
  DELAYED: "delayed",
  DELIVERED: "delivered",
  OPENED: "opened",
  CLICKED: "clicked",
  BOUNCED: "bounced",
  COMPLAINED: "complained",
  FAILED: "failed",
  UNSUBSCRIBED: "unsubscribed",
  REPLIED: "replied",
};

/** Capability a normalized event requires before it may be recorded. */
const CAPABILITY_BY_EVENT: Partial<Record<NormalizedEmailEventType, EmailProviderCapability>> = {
  OPENED: "open_tracking",
  CLICKED: "click_tracking",
  BOUNCED: "bounce_tracking",
};

export function deliveryStateForEvent(
  type: NormalizedEmailEventType | "UNKNOWN",
): DeliveryState | null {
  if (type === "UNKNOWN") return null;
  return STATE_BY_EVENT[type] ?? null;
}

async function providerCredentials(provider: string): Promise<EmailProviderCredentials | null> {
  const { loadPool, credentialsFor } = await import("@/lib/provider-pool.server");
  const pool = await loadPool(supabaseAdmin);
  const row = pool.find((p) => p.provider === provider);
  if (!row) return null;
  const creds = await credentialsFor(supabaseAdmin, row);
  const values = creds?.credentials as EmailProviderCredentials | undefined;
  return values ?? null;
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
  const { retryRaceFailedDeliveryEvents } = await import("@/lib/email-events.server");
  const retried = await retryRaceFailedDeliveryEvents(limit);
  repaired += retried.repaired;

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
  const creds = new Map<string, EmailProviderCredentials | null>();

  for (const message of messages) {
    const providerId = message.provider ?? "resend";
    const provider = getEmailProvider(providerId);

    // Providers that cannot be polled report exclusively through webhooks.
    if (!provider.getSendStatus || !provider.capabilities.delivery_tracking) {
      skipped += 1;
      continue;
    }
    if (!creds.has(providerId)) creds.set(providerId, await providerCredentials(providerId));
    const credentials = creds.get(providerId);
    if (!credentials) {
      skipped += 1;
      continue;
    }

    try {
      const status = await provider.getSendStatus(
        credentials,
        String(message.provider_message_id),
      );
      if (!status.known || !status.status) {
        skipped += 1;
        continue;
      }
      const capability = CAPABILITY_BY_EVENT[status.status as NormalizedEmailEventType];
      if (capability && !provider.capabilities[capability]) {
        // Never fabricate a signal the provider does not actually support.
        skipped += 1;
        continue;
      }
      const state = deliveryStateForEvent(status.status);
      if (!state) {
        skipped += 1;
        continue;
      }
      const applied = await applyDeliveryState({
        message,
        state,
        detail: status.detail,
        source: "reconcile",
      });
      if (applied === state && state !== (message.delivery_status ?? "queued")) updated += 1;
    } catch {
      skipped += 1;
    }
  }

  return { checked: messages.length, updated, skipped, repaired };
}
