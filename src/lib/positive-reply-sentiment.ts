/**
 * Mapping CRM / inbox statuses onto reply sentiment.
 *
 * Analytics counts a "positive reply" from `campaign_replies.sentiment`, so a
 * user marking a conversation or lead as Interested (or booked/won) must move
 * that lead's reply to `positive`, otherwise the campaign performance table
 * would keep showing 0 positives while the CRM says otherwise.
 */
export type ReplySentimentValue = "positive" | "neutral" | "negative" | "out_of_office";

const STATUS_SENTIMENT: Record<string, ReplySentimentValue> = {
  interested: "positive",
  meeting_booked: "positive",
  meeting: "positive",
  meeting_completed: "positive",
  won: "positive",
  completed: "positive",
  not_interested: "negative",
  ooo: "out_of_office",
  out_of_office: "out_of_office",
};

/** Returns the sentiment a status implies, or null when it implies nothing. */
export function sentimentForStatus(status: string | null | undefined): ReplySentimentValue | null {
  if (!status) return null;
  return STATUS_SENTIMENT[status.toLowerCase()] ?? null;
}
