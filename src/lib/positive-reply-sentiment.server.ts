/**
 * Keeps reply sentiment in step with the CRM status a user picks.
 *
 * Only existing reply rows are updated — no reply is invented — so analytics
 * stays a reflection of real received emails.
 */
import { sentimentForStatus, type ReplySentimentValue } from "@/lib/positive-reply-sentiment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export async function syncLeadReplySentiment(
  client: Client,
  leadId: string | null | undefined,
  status: string | null | undefined,
): Promise<ReplySentimentValue | null> {
  const sentiment = sentimentForStatus(status);
  if (!leadId || !sentiment) return null;
  try {
    await client
      .from("campaign_replies")
      .update({ sentiment })
      .eq("lead_id", leadId)
      .neq("sentiment", sentiment);
  } catch {
    /* sentiment sync must never block a status change */
  }
  return sentiment;
}
