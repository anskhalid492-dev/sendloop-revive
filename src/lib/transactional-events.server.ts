/**
 * Application event → transactional email bridge.
 *
 * Feature code calls `emitTransactionalEvent` with an event key and context.
 * It never talks to a provider, never builds HTML and never throws: a failed
 * notification must not fail the user's action.
 */
import { triggerTransactionalEmail } from "@/lib/transactional-email.server";

export type EmitInput = {
  eventKey: string;
  to?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  variables?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

/** Resolves recipient + name/workspace context, then queues the email. */
export async function emitTransactionalEvent(input: EmitInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let to = input.to ?? null;
    const variables: Record<string, unknown> = { ...(input.variables ?? {}) };

    if (input.userId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", input.userId)
        .maybeSingle();
      if (profile) {
        to = to ?? (profile.email as string | null);
        const full = String(profile.full_name ?? "").trim();
        const [first, ...rest] = full.split(/\s+/);
        variables["user.email"] ??= profile.email ?? "";
        variables["user.first_name"] ??= first || "there";
        variables["user.last_name"] ??= rest.join(" ");
      }
    }

    if (input.workspaceId && variables["workspace.name"] === undefined) {
      const { data: workspace } = await supabaseAdmin
        .from("workspaces")
        .select("name")
        .eq("id", input.workspaceId)
        .maybeSingle();
      if (workspace?.name) variables["workspace.name"] = workspace.name;
    }

    if (!to) return;

    await triggerTransactionalEmail(supabaseAdmin, {
      eventKey: input.eventKey,
      to,
      variables,
      idempotencyKey: input.idempotencyKey ?? null,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
    });
  } catch (error) {
    console.error("transactional event failed", input.eventKey, error);
  }
}
