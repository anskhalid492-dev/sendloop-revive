import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignLaunchEvent = {
  id: string;
  created_at: string;
  outcome: string;
  ready: boolean;
  issues: { code: string; message: string }[];
  list_name: string | null;
  eligible: number;
  already_queued: number;
  audience: number;
  active_mailboxes: number;
  queued_messages: number;
  total_recipients: number;
  first_send_at: string | null;
  error_message: string | null;
  actor_email: string | null;
};

/** Bounded launch history read, isolated from campaign launch and rendering code. */
export const getCampaignLaunchEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        limit: z.number().int().min(1).max(25).default(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const { data: rows, error } = await context.supabase
      .from("campaign_launch_events")
      .select(
        "id, created_at, outcome, ready, issues, list_name, eligible, already_queued, audience, active_mailboxes, queued_messages, total_recipients, first_send_at, error_message, actor_id",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as unknown as Array<
      Omit<CampaignLaunchEvent, "actor_email"> & { actor_id: string | null }
    >;
    const actorIds = [...new Set(events.map((event) => event.actor_id).filter(Boolean))] as string[];
    const emailById = new Map<string, string>();
    if (actorIds.length) {
      const { data: people, error: peopleError } = await context.supabase
        .from("profiles")
        .select("id, email")
        .in("id", actorIds);
      if (peopleError) throw new Error(peopleError.message);
      for (const person of (people ?? []) as Array<{ id: string; email: string | null }>) {
        if (person.email) emailById.set(person.id, person.email);
      }
    }

    const result = events.map(({ actor_id, ...event }) => ({
      ...event,
      issues: Array.isArray(event.issues) ? event.issues : [],
      actor_email: actor_id ? emailById.get(actor_id) ?? null : null,
    }));
    console.info("[campaign.getCampaignLaunchEvents] complete", {
      campaignId: data.campaignId,
      rows: result.length,
      totalMs: Date.now() - startedAt,
    });
    return result as CampaignLaunchEvent[];
  });