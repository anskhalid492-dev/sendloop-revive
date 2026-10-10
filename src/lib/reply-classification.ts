import { classifyInbound, stripQuotedReply, type ConversationStatus } from "@/lib/inbox-model";
import { decodeHtmlEntities } from "@/lib/email-body";

export const REPLY_CLASSIFIER_VERSION = "reply-rules-2026-10-10";
export function classifyProspectReply(body: string, headers?: Record<string, string> | null) {
  const status = classifyInbound("", body, headers);
  const text = stripQuotedReply(decodeHtmlEntities(body.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "").replace(/<[^>]*>/g, " "))).trim();
  const neutral = /^(thanks?( you)?|thank you|who are you|what is this)[.!?\s]*$/i.test(text);
  return {
    status,
    category: status === "interested" ? "positive" : status === "unsubscribed" ? "unsubscribe" : status === "not_interested" ? "negative" : status === "ooo" ? "out_of_office" : neutral ? "neutral" : "unclassified",
    // Rule matches are not calibrated AI probabilities.
    confidence: null,
    version: REPLY_CLASSIFIER_VERSION,
    needsReview: !status && !neutral,
  };
}

/** Automated reply processing must not erase a human's pipeline decision. */
export function automaticLeadStatus(current: string, detected: ConversationStatus | null): string {
  if (detected === "unsubscribed") return "unsubscribed";
  if (!["new", "contacted", "replied", "lead"].includes(current)) return current;
  if (detected === "interested") return "interested";
  if (detected === "not_interested") return "not_interested";
  if (detected === "bounced") return "bounced";
  return "replied";
}