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
    const { data: lead, error: leadError } = await client.from("leads").select("workspace_id").eq("id", leadId).maybeSingle();
    if (leadError || !lead) throw new Error("Could not verify reply workspace");
    const { error } = await client
      .from("campaign_replies")
      .update({ sentiment })
      .eq("workspace_id", lead.workspace_id)
      .eq("lead_id", leadId)
      .neq("sentiment", sentiment);
    if (error) throw new Error("Could not save reply classification");
  } catch (error) {
    throw new Error("Reply classification was not saved; please retry the status correction.", { cause: error });
  }
  return sentiment;
}
