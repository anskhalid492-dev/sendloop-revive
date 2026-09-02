/**
 * Positive reply notifications (server only).
 *
 * When the existing inbound reply classifier marks a prospect reply as
 * positive ("interested"), every workspace member who has the preference
 * enabled gets one MunchReach system email. It reuses:
 *   - the inbound/reply classification in `inbox.server.ts` (no second detector)
 *   - the transactional email engine + `transactional_emails` log (no second logger)
 *   - MunchReach-managed sending (never the customer's own mailbox)
 *
 * The function is best-effort: it never throws, so a notification problem can
 * never affect the prospect's reply, the conversation, or the campaign.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * Which reply notification is being sent. `reply` fires for EVERY stored
 * inbound reply, `positive` only when the classifier marks it interested — a
 * positive reply therefore produces both, each with its own idempotency key
 * and its own user preference.
 */
export type ReplyNotificationKind = "reply" | "positive";

export type PositiveReplyInput = {
  workspaceId: string;
  conversationId: string;
  /** Inbound message id (or provider Message-ID) — the idempotency source. */
  inboundMessageId: string;
  leadId: string | null;
  campaignId: string | null;
  leadEmail: string;
  replyBody: string;
  subject?: string | null;
  kind?: ReplyNotificationKind;
};

const EVENT_KEYS: Record<ReplyNotificationKind, string> = {
  reply: "reply.received",
  positive: "positive_reply_notification",
};

/** Preference column that switches each notification off. */
const PREF_COLUMN: Record<ReplyNotificationKind, string> = {
  reply: "new_replies",
  positive: "positive_reply_notifications",
};

function appUrl(): string {
  return process.env["APP_URL"] || process.env["VITE_APP_URL"] || "https://munchreach.com";
}

function previewText(body: string, max = 280): string {
  return (body ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function notifyPositiveReply(input: PositiveReplyInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: Admin = supabaseAdmin;
    const { triggerTransactionalEmail } = await import("@/lib/transactional-email.server");

    const [{ data: workspace }, { data: lead }, { data: campaign }, { data: members }] =
      await Promise.all([
        admin.from("workspaces").select("id, name").eq("id", input.workspaceId).maybeSingle(),
        input.leadId
          ? admin
              .from("leads")
              .select("first_name, last_name, email, company")
              .eq("id", input.leadId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        input.campaignId
          ? admin.from("campaigns").select("id, name").eq("id", input.campaignId).maybeSingle()
          : Promise.resolve({ data: null }),
        admin.from("workspace_members").select("user_id").eq("workspace_id", input.workspaceId),
      ]);

    const userIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
    if (userIds.length === 0) {
      console.warn("positive reply notification: workspace has no members", input.workspaceId);
      return;
    }

    const [{ data: profiles }, prefsResult] = await Promise.all([
      admin.from("profiles").select("id, email, first_name").in("id", userIds),
      admin
        .from("notification_preferences")
        .select("user_id, email_enabled, positive_reply_notifications")
        .in("user_id", userIds),
    ]);

    // The dedicated preference column may not exist yet on this database; fall
    // back to the channel preference so the toggle degrades to "on" safely.
    let prefs = prefsResult.data as unknown;
    if (prefsResult.error) {
      const retry = await admin
        .from("notification_preferences")
        .select("user_id, email_enabled")
        .in("user_id", userIds);
      prefs = retry.data;
    }

    const prefByUser = new Map(
      ((prefs ?? []) as Array<{
        user_id: string;
        email_enabled: boolean | null;
        positive_reply_notifications: boolean | null;
      }>).map((p) => [p.user_id, p]),
    );

    const leadName =
      [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim() || input.leadEmail;
    const base = appUrl();

    const variables = {
      lead_name: leadName,
      lead_email: lead?.email || input.leadEmail,
      company_name: lead?.company || "their company",
      campaign_name: campaign?.name || "your campaign",
      campaign_url: campaign?.id ? `${base}/campaigns/${campaign.id}` : `${base}/campaigns`,
      reply_preview: previewText(input.replyBody),
      reply_url: `${base}/inbox?conversation=${input.conversationId}`,
      workspace_name: workspace?.name || "your workspace",
      "workspace.name": workspace?.name || "your workspace",
    };

    for (const userId of userIds) {
      const pref = prefByUser.get(userId);
      // Default ON: a member without a preferences row still gets notified.
      if (pref && pref.positive_reply_notifications === false) continue;
      if (pref && pref.email_enabled === false) continue;

      const profile = ((profiles ?? []) as Array<{ id: string; email: string | null; first_name: string | null }>)
        .find((p) => p.id === userId);
      if (!profile?.email) {
        console.warn("positive reply notification: no email on file for user", userId);
        continue;
      }

      await triggerTransactionalEmail(admin, {
        eventKey: EVENT_KEY,
        to: profile.email,
        workspaceId: input.workspaceId,
        userId,
        // One notification per inbound message per recipient. A replayed
        // webhook hits the unique idempotency key and is skipped.
        idempotencyKey: `${EVENT_KEY}:${input.inboundMessageId}:${userId}`,
        variables: {
          ...variables,
          "user.first_name": profile.first_name || "there",
          "user.email": profile.email,
        },
      });
    }
  } catch (error) {
    // Logged only: reply ingestion, threading and campaign state are unaffected.
    console.error("positive reply notification failed", error);
  }
}
