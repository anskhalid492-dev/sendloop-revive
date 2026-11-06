/**
 * Client-safe source labels for incoming email.
 *
 * Source is decided ONLY from stored evidence:
 *  - warmup: a threading header (In-Reply-To / References) matches a warmup
 *    job's provider Message-ID.
 *  - campaign: the inbound row is linked to a campaign send
 *    (`campaign_message_id`), which inbound ingestion only sets after header
 *    attribution. A sender address matching a prospect is never evidence.
 *  - auto: unlinked machine reply (OOO / auto-submitted).
 *  - other: anything else.
 */
export type ReplySource = "campaign_reply" | "warmup_reply" | "auto_reply" | "other";

export const REPLY_SOURCE_LABELS: Record<ReplySource, string> = {
  campaign_reply: "Reply",
  warmup_reply: "Warmup Reply",
  auto_reply: "Auto Reply",
  other: "Other Incoming Email",
};

export const REPLY_SOURCE_STYLES: Record<ReplySource, string> = {
  campaign_reply: "border-primary/30 bg-primary/10 text-primary",
  warmup_reply: "border-accent-foreground/20 bg-accent text-accent-foreground",
  auto_reply: "border-border bg-muted text-muted-foreground",
  other: "border-border bg-background text-muted-foreground",
};

export type ReplySourceEvidence = {
  campaignMessageId: string | null;
  warmupMatched: boolean;
  isAutoReply: boolean;
};

export function classifyReplySource(e: ReplySourceEvidence): ReplySource {
  // Warmup first: a warmup thread must never be counted as a campaign reply.
  if (e.warmupMatched) return "warmup_reply";
  if (e.campaignMessageId) return "campaign_reply";
  if (e.isAutoReply) return "auto_reply";
  return "other";
}

/** Only genuine campaign replies count toward campaign/platform reply metrics. */
export function countsAsCampaignReply(source: ReplySource): boolean {
  return source === "campaign_reply";
}

/**
 * Collapse duplicate notifications for the same conversation + message that
 * were inserted by a re-processed inbound event (same entity, same text,
 * within two minutes). Newest-first order is preserved.
 */
export function dedupeNotifications<
  T extends { id: string; entity_id: string | null; title: string; message: string | null; created_at: string },
>(items: T[]): T[] {
  const kept: T[] = [];
  for (const n of items) {
    const dup = kept.some(
      (k) =>
        k.entity_id &&
        k.entity_id === n.entity_id &&
        k.title === n.title &&
        (k.message ?? "") === (n.message ?? "") &&
        Math.abs(new Date(k.created_at).getTime() - new Date(n.created_at).getTime()) < 120_000,
    );
    if (!dup) kept.push(n);
  }
  return kept;
}
