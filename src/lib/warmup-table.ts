import type { SupabaseClient } from "@supabase/supabase-js";

/** Health guidance is not evidence of measured spam-folder placement. */
export function warmupSpamLabel(spam: number, inbox: number, sent: number, health: number | null): string {
  if (spam > 0 || inbox > 0) return String(spam);
  if (health === 100) return "Safe";
  if (health !== null && health < 80) return "Lower the sending volume";
  return sent > 0 ? "Not available" : "—";
}

export function warmupActivityLabel(timestamp: string | null, now = Date.now()): string {
  if (!timestamp) return "Not available";
  const activity = new Date(timestamp);
  const elapsed = now - activity.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Not available";
  if (elapsed < 60_000) return "Just now";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (activity.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) {
    const hours = Math.floor(elapsed / 3_600_000);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return `${Math.floor(elapsed / 86_400_000)} days ago`;
}

/** One bounded success-only read per mailbox, so a busy mailbox cannot hide another's history. */
export async function latestSuccessfulWarmupActivity(client: SupabaseClient, accountIds: string[]) {
  const entries = await Promise.all(accountIds.map(async (id): Promise<[string, string | null]> => {
    const { data, error } = await client.from("warmup_events")
      .select("occurred_at")
      .eq("sending_account_id", id)
      .in("type", ["sent", "delivered", "replied"])
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return [id, error ? null : data?.occurred_at ?? null];
  }));
  return new Map(entries);
}