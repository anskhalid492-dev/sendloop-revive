/**
 * Product-event → marketing bridge (server-only).
 *
 * The Marketing Engine never invents its own event system. Product code calls
 * `handleProductEvent` with one of the EXISTING product events; the bridge
 * resolves (or creates) the matching marketing subscriber and enrols them in
 * every active automation listening for that event.
 *
 * Failures here are logged and swallowed: a marketing side effect must never
 * break a product action such as signup or campaign launch.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { isProductEvent, type ProductEvent } from "./events";
import { enrollSubscriber } from "./automations.server";
import { upsertSubscriber } from "./subscribers.server";

export type ProductEventInput = {
  event: ProductEvent | string;
  email: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export async function handleProductEvent(input: ProductEventInput): Promise<void> {
  try {
    if (!isProductEvent(input.event)) return;
    const email = input.email?.trim().toLowerCase();
    if (!email) return;

    const { data: automations } = await supabaseAdmin
      .from("marketing_automations")
      .select("id")
      .eq("status", "active")
      .eq("trigger_event", input.event);
    const targets = (automations ?? []) as { id: string }[];
    if (targets.length === 0) return;

    const { subscriber } = await upsertSubscriber({
      email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      userId: input.userId ?? null,
      source: "product",
      tags: ["product"],
    });

    for (const automation of targets) {
      await enrollSubscriber({
        automationId: automation.id,
        subscriberId: subscriber.id,
        triggerEvent: input.event,
      });
    }
  } catch (error) {
    console.error("[marketing] product event bridge failed", {
      event: input.event,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
