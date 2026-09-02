/**
 * Persisting the final rendered email for one recipient.
 *
 * Written immediately BEFORE the provider hand-off, so the exact copy that
 * reaches the prospect survives even if the send throws, the process dies, or
 * the inbox mirroring step fails afterwards.
 */
import type { SentSnapshot } from "@/lib/sent-snapshot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const SENT_SNAPSHOT_COLUMNS =
  "final_subject, final_body, final_html, final_from_email, final_from_name, final_to_email, rendered_at";

/**
 * Best-effort write: a deployment where the snapshot columns are not present
 * yet must keep sending exactly as before, so a missing-column error is
 * swallowed instead of failing the send.
 */
export async function persistSentSnapshot(
  supabase: AnySupabase,
  messageId: string,
  snapshot: SentSnapshot,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("campaign_messages")
      .update(snapshot)
      .eq("id", messageId);
    return !error;
  } catch {
    return false;
  }
}
