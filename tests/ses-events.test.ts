import { describe, expect, it } from "vitest";
import { sesDeliveryEvent, sesFlattenEventPayload } from "@/lib/email-providers/ses-events";
import { classifyEvent, externalIdOf, normalizeDelivery } from "@/lib/inbound-parse";

const MESSAGE_ID = "0100018f-2c1d-4a2f-9a5c-000000000000";

function sns(message: unknown) {
  return {
    Type: "Notification",
    MessageId: "sns-1",
    TopicArn: "arn:aws:sns:us-east-1:267544547500:munchreach-events",
    Timestamp: "2026-08-27T10:00:00.000Z",
    Message: JSON.stringify(message),
  };
}

const mail = {
  timestamp: "2026-08-27T09:59:00.000Z",
  source: "hello@smartoutreach.art",
  messageId: MESSAGE_ID,
  destination: ["lead@example.com"],
  commonHeaders: { subject: "Quick question" },
};

describe("SES event publishing normalization", () => {
  it("flattens a delivery notification", () => {
    const flat = sesFlattenEventPayload(sns({ eventType: "Delivery", mail, delivery: { recipients: ["lead@example.com"], timestamp: "2026-08-27T10:00:01.000Z" } }));
    expect(flat).toBeTruthy();
    expect(classifyEvent(flat!)).toBe("delivered");
    const delivery = normalizeDelivery(flat!);
    expect(delivery.providerMessageId).toBe(MESSAGE_ID);
    expect(delivery.email).toBe("lead@example.com");
  });

  it("flattens a bounce with its diagnostic code and classification", () => {
    const flat = sesFlattenEventPayload(
      sns({
        eventType: "Bounce",
        mail,
        bounce: {
          bounceType: "Permanent",
          bounceSubType: "General",
          timestamp: "2026-08-27T10:00:02.000Z",
          bouncedRecipients: [{ emailAddress: "lead@example.com", diagnosticCode: "smtp; 550 unknown" }],
        },
      }),
    );
    expect(classifyEvent(flat!)).toBe("bounced");
    expect(normalizeDelivery(flat!).reason).toContain("550");
    expect(sesDeliveryEvent(sns({ eventType: "Bounce", mail, bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "lead@example.com" }] } }))?.bounceType).toBe("hard");
  });

  it("flattens complaint, reject and delivery-delay events", () => {
    const complaint = sesFlattenEventPayload(sns({ eventType: "Complaint", mail, complaint: { complainedRecipients: [{ emailAddress: "lead@example.com" }], complaintFeedbackType: "abuse" } }));
    expect(classifyEvent(complaint!)).toBe("complained");

    const reject = sesFlattenEventPayload(sns({ eventType: "Reject", mail, reject: { reason: "Bad content" } }));
    expect(classifyEvent(reject!)).toBe("rejected");

    const delay = sesFlattenEventPayload(sns({ eventType: "DeliveryDelay", mail, deliveryDelay: { delayType: "MailboxFull", delayedRecipients: [{ emailAddress: "lead@example.com" }] } }));
    expect(classifyEvent(delay!)).toBe("delayed");
  });

  it("ignores inbound receipts and unrelated payloads", () => {
    expect(sesFlattenEventPayload(sns({ notificationType: "Received", mail }))).toBeNull();
    expect(sesFlattenEventPayload({ type: "email.delivered" })).toBeNull();
    expect(sesFlattenEventPayload(sns({ eventType: "Open", mail: { messageId: null } }))).toBeNull();
  });

  it("produces a stable dedupe id per event kind so redeliveries never duplicate", () => {
    const payload = sns({ eventType: "Delivery", mail, delivery: { recipients: ["lead@example.com"] } });
    const first = sesFlattenEventPayload(payload)!;
    const second = sesFlattenEventPayload(payload)!;
    expect(externalIdOf(first, "delivered")).toBe(externalIdOf(second, "delivered"));
    expect(externalIdOf(first, "delivered")).not.toBe(externalIdOf(first, "bounced"));
  });

  it("normalizes into the provider-neutral event vocabulary", () => {
    const event = sesDeliveryEvent(sns({ eventType: "Delivery", mail, delivery: { recipients: ["lead@example.com"] } }));
    expect(event).toMatchObject({ type: "DELIVERED", provider: "ses", providerMessageId: MESSAGE_ID, recipient: "lead@example.com" });
  });
});

describe("SES adapter event wiring", () => {
  it("normalizes event notifications through the adapter and keeps inbound intact", async () => {
    const { sesEmailProvider } = await import("@/lib/email-providers/ses.server");
    const flat = sesEmailProvider.normalizeWebhookPayload?.(
      sns({ eventType: "Delivery", mail, delivery: { recipients: ["lead@example.com"] } }) as Record<string, unknown>,
    );
    expect(classifyEvent(flat!)).toBe("delivered");
    expect(sesEmailProvider.capabilities.delivery_tracking).toBe(true);
    expect(sesEmailProvider.capabilities.bounce_tracking).toBe(true);
    expect(typeof sesEmailProvider.listWebhooks).toBe("function");
  });

  it("reports no event destinations when publishing is not configured", async () => {
    delete process.env["AWS_SES_CONFIGURATION_SET"];
    delete process.env["AWS_SES_EVENT_TOPIC_ARN"];
    const { listSesWebhookEntries, ensureSesEventPublishing } = await import(
      "@/lib/email-providers/ses-events.server"
    );
    expect(await listSesWebhookEntries({})).toEqual([]);
    expect((await ensureSesEventPublishing({})).ok).toBe(false);
  });
});

describe("ses open and click tracking", () => {
  it("subscribes the event destination to OPEN and CLICK", async () => {
    const { SES_EVENT_TYPES } = await import("@/lib/email-providers/ses-events.server");
    expect(SES_EVENT_TYPES).toContain("OPEN");
    expect(SES_EVENT_TYPES).toContain("CLICK");
  });

  it("refuses to set a tracking domain when publishing is not configured", async () => {
    delete process.env["AWS_SES_CONFIGURATION_SET"];
    const { ensureSesTrackingOptions } = await import("@/lib/email-providers/ses-events.server");
    expect((await ensureSesTrackingOptions({}, "track.example.com")).ok).toBe(false);
  });

  it("maps provider open and click events to engagement types", async () => {
    const { sesEmailProvider } = await import("@/lib/email-providers/ses.server");
    const mail = { messageId: "abc", destination: ["lead@example.com"] };
    for (const [eventType, expected] of [
      ["Open", "opened"],
      ["Click", "clicked"],
    ] as const) {
      const flat = sesEmailProvider.normalizeWebhookPayload?.(
        sns({ eventType, mail }) as Record<string, unknown>,
      );
      expect(classifyEvent(flat!)).toBe(expected);
    }
  });
});
