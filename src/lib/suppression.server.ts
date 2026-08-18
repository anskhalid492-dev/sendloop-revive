/**
 * Workspace-level suppression list.
 *
 * A bounce, spam complaint or unsubscribe permanently removes an address from
 * every future send in that workspace. Enforcement lives here so the campaign
 * engine, the inbox reply path and manual compose all obey the same rule.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SuppressionReason = "bounced" | "complained" | "unsubscribed" | "manual";

export async function suppressEmail(args: {
  workspaceId: string;
  email: string;
  reason: SuppressionReason;
  source?: string;
  detail?: string | null;
}) {
  const email = args.email.trim().toLowerCase();
  if (!email) return;
  await supabaseAdmin.from("email_suppressions").upsert(
    {
      workspace_id: args.workspaceId,
      email,
      reason: args.reason,
      source: args.source ?? "webhook",
      detail: args.detail ?? null,
    },
    { onConflict: "workspace_id,email" },
  );
}

export async function isSuppressed(workspaceId: string, email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("email_suppressions")
    .select("reason")
    .eq("workspace_id", workspaceId)
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return data?.reason ?? null;
}

/** Bulk check used by the dispatcher so one query covers a whole batch. */
export async function suppressedSet(
  workspaceId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabaseAdmin
    .from("email_suppressions")
    .select("email, reason")
    .eq("workspace_id", workspaceId)
    .in("email", unique);
  return new Map((data ?? []).map((row) => [row.email, row.reason] as const));
}
