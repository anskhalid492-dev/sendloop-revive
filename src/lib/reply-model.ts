export const REPLY_SENTIMENTS = ["positive", "neutral", "negative", "out_of_office"] as const;
export type ReplySentiment = (typeof REPLY_SENTIMENTS)[number];

export const REPLY_SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  out_of_office: "Out of office",
};

export type CampaignReply = {
  id: string;
  campaign_id: string | null;
  message_id: string | null;
  lead_id: string;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  sentiment: string;
  received_at: string;
};
