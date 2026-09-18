/**
 * Strict campaign attribution for inbound mailbox email.
 *
 * A connected mailbox receives all kinds of mail. Only a message that can be
 * tied to a real MunchReach outbound campaign email may touch CRM state or
 * campaign analytics. This module holds that decision as pure logic so every
 * inbound path (IMAP polling, provider webhook) reaches the same verdict and
 * the rules can be tested without a database.
 *
 * Never sufficient on its own:
 *   - a matching / similar subject
 *   - the sender existing as a lead or CRM contact
 */

export type CampaignAttributionEvidence =
  /** Reply landed on an unguessable per-send routing address. */
  | "reply_route_token"
  /** In-Reply-To points at a Message-ID we stored when sending. */
  | "in_reply_to"
  /** References points at a Message-ID we stored when sending. */
  | "references"
  /** Headers matched a message already stored on a campaign thread. */
  | "thread_message_id"
  /** Qualified secondary check: campaign recipient + real outbound send. */
  | "campaign_recipient_thread";

export type InboundShape = {
  subject: string | null;
  body: string | null;
  inReplyTo: string | null;
  references: string[];
};

const FORWARD_SUBJECT = /^\s*(fwd?|fw|wg|tr|rv|enc)\s*:/i;
const FORWARD_MARKERS = [
  "---------- forwarded message",
  "-------- forwarded message",
  "begin forwarded message",
  "----- original message -----",
];

/** A forward is a new message about old mail, never a reply to our send. */
export function isForwardedInbound(shape: Pick<InboundShape, "subject" | "body">): boolean {
  const subject = shape.subject ?? "";
  if (FORWARD_SUBJECT.test(subject)) return true;
  const body = (shape.body ?? "").toLowerCase();
  return FORWARD_MARKERS.some((marker) => body.includes(marker));
}

/** Reply-shaped: carries threading headers, or at least a `Re:` subject. */
export function isReplyShaped(shape: InboundShape): boolean {
  if ((shape.inReplyTo ?? "").trim()) return true;
  if ((shape.references ?? []).some((ref) => (ref ?? "").trim())) return true;
  return /^\s*(re|aw|antw|sv|res)\s*:/i.test(shape.subject ?? "");
}

/** Which header carried the Message-ID we matched. */
export function evidenceForCandidate(
  matchedId: string | null,
  inReplyTo: string | null,
): "in_reply_to" | "references" {
  const wanted = (matchedId ?? "").trim().toLowerCase();
  const direct = (inReplyTo ?? "").trim().toLowerCase();
  return wanted && direct && wanted === direct ? "in_reply_to" : "references";
}

export type SecondaryAttributionInput = {
  shape: InboundShape;
  /** A campaign_recipients row links this contact to the campaign. */
  leadIsCampaignRecipient: boolean;
  /** A campaign_messages row was actually sent to this address. */
  outboundSendExists: boolean;
  /** That send left the mailbox this email was received on. */
  sameSendingAccount: boolean;
  sentAt: string | null;
  receivedAt: string;
  maxAgeDays?: number;
};

export type AttributionVerdict = {
  attributed: boolean;
  reason: string;
};

export const SECONDARY_MAX_AGE_DAYS = 90;

/**
 * Secondary check for a genuine reply whose client dropped the threading
 * headers. Every condition must hold: the contact is a recipient of the
 * campaign, a real send exists to that address, it left the same mailbox, it
 * predates the reply within the window, and the inbound looks like a reply
 * rather than a forward.
 */
export function evaluateSecondaryAttribution(input: SecondaryAttributionInput): AttributionVerdict {
  if (!input.outboundSendExists) {
    return { attributed: false, reason: "No outbound campaign email was sent to this address" };
  }
  if (!input.leadIsCampaignRecipient) {
    return { attributed: false, reason: "Sender is not a recipient of that campaign" };
  }
  if (!input.sameSendingAccount) {
    return { attributed: false, reason: "Reply did not arrive on the mailbox that sent the campaign" };
  }
  if (isForwardedInbound(input.shape)) {
    return { attributed: false, reason: "Forwarded message, not a reply to a campaign email" };
  }
  if (!isReplyShaped(input.shape)) {
    return { attributed: false, reason: "Message carries no reply relationship" };
  }
  const sent = input.sentAt ? Date.parse(input.sentAt) : Number.NaN;
  const received = Date.parse(input.receivedAt);
  if (Number.isNaN(sent) || Number.isNaN(received)) {
    return { attributed: false, reason: "Send or receive time unknown" };
  }
  if (sent > received) {
    return { attributed: false, reason: "Campaign email was sent after this reply arrived" };
  }
  const maxAge = (input.maxAgeDays ?? SECONDARY_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  if (received - sent > maxAge) {
    return { attributed: false, reason: "Campaign email is older than the attribution window" };
  }
  return { attributed: true, reason: "Campaign recipient replying to a real send on this mailbox" };
}

export type AttributionInput = {
  /** Campaign pinned by an unguessable reply routing token. */
  routeCampaignId?: string | null;
  /** Campaign send matched through stored Message-IDs. */
  headerMatch?: {
    campaignId: string | null;
    via: "in_reply_to" | "references" | "thread_message_id";
  } | null;
  /** Campaign of a conversation that was matched by token or headers. */
  threadCampaignId?: string | null;
  /** Result of the qualified secondary check, when it was run. */
  secondary?: { campaignId: string | null; verdict: AttributionVerdict } | null;
};

export type CampaignAttribution = {
  attributed: boolean;
  campaignId: string | null;
  evidence: CampaignAttributionEvidence | null;
  reason: string;
};

/** The single verdict every inbound path uses before touching CRM/analytics. */
export function decideCampaignAttribution(input: AttributionInput): CampaignAttribution {
  if (input.routeCampaignId) {
    return {
      attributed: true,
      campaignId: input.routeCampaignId,
      evidence: "reply_route_token",
      reason: "Reply arrived on a per-send routing address",
    };
  }
  if (input.headerMatch?.campaignId) {
    return {
      attributed: true,
      campaignId: input.headerMatch.campaignId,
      evidence: input.headerMatch.via,
      reason: "Threading headers matched a stored campaign Message-ID",
    };
  }
  if (input.threadCampaignId) {
    return {
      attributed: true,
      campaignId: input.threadCampaignId,
      evidence: "thread_message_id",
      reason: "Threading headers matched a message on a campaign thread",
    };
  }
  if (input.secondary?.verdict.attributed && input.secondary.campaignId) {
    return {
      attributed: true,
      campaignId: input.secondary.campaignId,
      evidence: "campaign_recipient_thread",
      reason: input.secondary.verdict.reason,
    };
  }
  return {
    attributed: false,
    campaignId: null,
    evidence: null,
    reason:
      input.secondary?.verdict.reason ?? "No campaign email could be linked to this inbound message",
  };
}
