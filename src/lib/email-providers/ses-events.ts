/**
 * Amazon SES EVENT PUBLISHING (SNS notification) -> MunchReach flat payload.
 *
 * Flow this module serves:
 *   SES -> Configuration Set / Event Destination -> SNS HTTPS POST ->
 *   existing inbound webhook endpoint -> this normalization ->
 *   existing provider-neutral event processor -> campaign_messages / analytics
 *
 * Delivery, bounce, complaint, reject and delivery-delay notifications are
 * reshaped into the SAME flat payload shape the production parser
 * (`src/lib/inbound-parse.ts`) already reads, so matching, idempotency and
 * analytics behave exactly as they do for every other provider.
 *
 * Pure and client-safe: no AWS calls, no environment, no Supabase.
 */
import { parseSnsEnvelope } from "./ses-inbound";
import { classifyEvent, externalIdOf } from "@/lib/inbound-parse";
import type { NormalizedEmailEvent } from "./types";

const ID = "ses";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = str(value);
    return single ? [single] : [];
  }
  return value.map((v) => str(v)).filter((v): v is string => !!v);
}

type Dict = Record<string, unknown>;

/** SES event type -> the flat `type` string the shared classifier reads. */
const EVENT_TYPE_MAP: Record<string, string> = {
  send: "email.sent",
  open: "email.opened",
  click: "email.clicked",
  delivery: "email.delivered",
  bounce: "email.bounced",
  complaint: "email.complained",
  reject: "email.rejected",
  deliverydelay: "email.delayed",
  "delivery delay": "email.delayed",
  renderingfailure: "email.failed",
  "rendering failure": "email.failed",
};

function recipientsOf(kind: string, notification: Dict, mail: Dict): string[] {
  const pick = (block: unknown, key: string): string[] => {
    const rows = Array.isArray(block) ? block : [];
    return rows
      .map((row) => str((row as Dict)?.["emailAddress"]) ?? str(row))
      .filter((v): v is string => !!v)
      .concat(key ? [] : []);
  };
  if (kind === "bounce") {
    const bounce = (notification["bounce"] ?? {}) as Dict;
    const rows = pick(bounce["bouncedRecipients"], "");
    if (rows.length) return rows;
  }
  if (kind === "complaint") {
    const complaint = (notification["complaint"] ?? {}) as Dict;
    const rows = pick(complaint["complainedRecipients"], "");
    if (rows.length) return rows;
  }
  if (kind === "delivery") {
    const delivery = (notification["delivery"] ?? {}) as Dict;
    const rows = list(delivery["recipients"]);
    if (rows.length) return rows;
  }
  if (kind === "deliverydelay") {
    const delay = (notification["deliveryDelay"] ?? {}) as Dict;
    const rows = pick(delay["delayedRecipients"], "");
    if (rows.length) return rows;
  }
  return list(mail["destination"]);
}

function reasonOf(kind: string, notification: Dict): string | null {
  if (kind === "bounce") {
    const bounce = (notification["bounce"] ?? {}) as Dict;
    const first = (Array.isArray(bounce["bouncedRecipients"]) ? bounce["bouncedRecipients"][0] : null) as Dict | null;
    return (
      str(first?.["diagnosticCode"]) ??
      [str(bounce["bounceType"]), str(bounce["bounceSubType"])].filter(Boolean).join(" / ") ??
      null
    );
  }
  if (kind === "complaint") {
    const complaint = (notification["complaint"] ?? {}) as Dict;
    return str(complaint["complaintFeedbackType"]) ?? "Recipient marked the email as spam.";
  }
  if (kind === "reject") {
    const reject = (notification["reject"] ?? {}) as Dict;
    return str(reject["reason"]);
  }
  if (kind === "deliverydelay") {
    const delay = (notification["deliveryDelay"] ?? {}) as Dict;
    return str(delay["delayType"]) ?? "Delivery is delayed.";
  }
  if (kind === "renderingfailure") {
    const failure = (notification["failure"] ?? {}) as Dict;
    return str(failure["errorMessage"]);
  }
  return null;
}

function bounceClass(notification: Dict): "hard" | "soft" | "block" | "unknown" {
  const bounce = (notification["bounce"] ?? {}) as Dict;
  const type = (str(bounce["bounceType"]) ?? "").toLowerCase();
  if (type === "permanent") return "hard";
  if (type === "transient") return "soft";
  if (type === "undetermined") return "unknown";
  return "unknown";
}

function occurredAt(kind: string, notification: Dict, mail: Dict, fallback: string | null): string | null {
  const blocks: Record<string, string> = {
    delivery: "delivery",
    bounce: "bounce",
    complaint: "complaint",
    reject: "reject",
    deliverydelay: "deliveryDelay",
  };
  const block = (notification[blocks[kind] ?? ""] ?? {}) as Dict;
  return str(block["timestamp"]) ?? str(mail["timestamp"]) ?? fallback;
}

/**
 * Turns an SNS/SES *event publishing* notification into the flat payload shape
 * the existing processor understands. Returns `null` for anything that is not
 * a delivery-tracking event (inbound receipts are handled elsewhere).
 */
export function sesFlattenEventPayload(payload: unknown): Record<string, unknown> | null {
  const envelope = parseSnsEnvelope(payload);
  if (!envelope || envelope.type !== "Notification") return null;

  let notification: Dict;
  try {
    const parsed = JSON.parse(envelope.message) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    notification = parsed as Dict;
  } catch {
    return null;
  }

  const kind = String(notification["eventType"] ?? notification["notificationType"] ?? "")
    .trim()
    .toLowerCase();
  if (!kind || kind === "received") return null;
  const type = EVENT_TYPE_MAP[kind];
  if (!type) return null;

  const mail = (notification["mail"] ?? {}) as Dict;
  const messageId = str(mail["messageId"]);
  if (!messageId) return null;

  const recipients = recipientsOf(kind, notification, mail);
  const timestamp = occurredAt(kind, notification, mail, envelope.timestamp);

  return {
    type,
    provider: ID,
    data: {
      email_id: messageId,
      message_id: messageId,
      to: recipients,
      recipient: recipients[0] ?? null,
      from: str(mail["source"]),
      subject: str(((mail["commonHeaders"] ?? {}) as Dict)["subject"]),
      reason: reasonOf(kind, notification),
      bounce_type: kind === "bounce" ? bounceClass(notification) : null,
      created_at: timestamp,
      timestamp,
    },
  };
}

/** Provider-neutral delivery event for the unified layer. */
export function sesDeliveryEvent(payload: unknown): NormalizedEmailEvent | null {
  const flat = sesFlattenEventPayload(payload);
  if (!flat) return null;
  const kind = classifyEvent(flat);
  const data = flat["data"] as Dict;

  const typeMap: Record<string, NormalizedEmailEvent["type"]> = {
    sent: "SENT",
    delivered: "DELIVERED",
    bounced: "BOUNCED",
    complained: "COMPLAINED",
    rejected: "FAILED",
    delayed: "DELAYED",
    failed: "FAILED",
  };

  return {
    type: typeMap[kind] ?? "UNKNOWN",
    provider: ID,
    providerEventId: externalIdOf(flat, kind),
    providerMessageId: str(data["email_id"]),
    recipient: str(data["recipient"]),
    sender: str(data["from"]),
    subject: str(data["subject"]),
    bounceType: (data["bounce_type"] as NormalizedEmailEvent["bounceType"]) ?? null,
    reason: str(data["reason"]),
    occurredAt: str(data["created_at"]),
    rawMetadata: payload,
  };
}
