import { describe, expect, it } from "vitest";

import { sesEmailProvider } from "../ses.server";
import { sesFlattenInboundPayload, sesInboundEvent, parseSnsEnvelope } from "../ses-inbound";
import { parseMimeMessage, decodeQuotedPrintable } from "../ses-mime";
import { snsCanonicalString, spkiFromCertificate } from "../ses-sns.server";

const RAW_MIME = [
  "From: Gmail Prospect <prospect@gmail.com>",
  "To: sales@customer-domain.com",
  "Subject: Re: Quick question",
  "Message-ID: <gmail-reply@mail.gmail.com>",
  "In-Reply-To: <original@munchreach.local>",
  "References: <original@munchreach.local>",
  'Content-Type: multipart/alternative; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Yes, that sounds great =E2=80=94 let's talk Tuesday.",
  "--b1",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<p>Yes, that sounds great</p>",
  "--b1--",
  "",
].join("\r\n");

function snsNotification(overrides: Record<string, unknown> = {}) {
  const message = {
    notificationType: "Received",
    mail: {
      timestamp: "2026-08-27T10:00:00.000Z",
      source: "prospect@gmail.com",
      messageId: "ses-inbound-1",
      destination: ["sales@customer-domain.com"],
      commonHeaders: { subject: "Re: Quick question", from: ["Gmail Prospect <prospect@gmail.com>"] },
    },
    receipt: { recipients: ["sales+abc123xyz789@customer-domain.com"] },
    content: btoa(RAW_MIME),
    ...overrides,
  };
  return {
    Type: "Notification",
    MessageId: "sns-1",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:munchreach-inbound",
    Timestamp: "2026-08-27T10:00:01.000Z",
    Message: JSON.stringify(message),
    SignatureVersion: "1",
    Signature: "c2ln",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
  };
}

describe("SES MIME reader", () => {
  it("decodes quoted-printable and multipart bodies", () => {
    const parsed = parseMimeMessage(RAW_MIME);
    expect(parsed.text).toContain("sounds great — let's talk Tuesday.");
    expect(parsed.html).toContain("<p>Yes, that sounds great</p>");
    expect(parsed.headers.find((h) => h.name.toLowerCase() === "message-id")?.value).toBe(
      "<gmail-reply@mail.gmail.com>",
    );
  });

  it("decodes quoted-printable soft line breaks", () => {
    expect(decodeQuotedPrintable("hello=\r\n world")).toBe("hello world");
  });
});

describe("SES inbound normalization", () => {
  it("flattens an SNS receipt notification into the shared inbound shape", () => {
    const flat = sesFlattenInboundPayload(snsNotification());
    expect(flat).not.toBeNull();
    const data = flat!["data"] as Record<string, unknown>;
    expect(flat!["type"]).toBe("email.received");
    expect(data["from"]).toContain("prospect@gmail.com");
    expect(data["text"]).toContain("sounds great");
  });

  it("keeps the plus-routed envelope recipient for threading", () => {
    const event = sesInboundEvent(snsNotification());
    expect(event?.to[0]).toBe("sales+abc123xyz789@customer-domain.com");
    expect(event?.messageId).toBe("<gmail-reply@mail.gmail.com>");
    expect(event?.inReplyTo).toBe("<original@munchreach.local>");
    expect(event?.providerMessageId).toBe("ses-inbound-1");
    expect(event?.html).toContain("Yes, that sounds great");
  });

  it("ignores non-inbound notifications", () => {
    const bounce = snsNotification({ notificationType: "Bounce" });
    expect(sesFlattenInboundPayload(bounce)).toBeNull();
    expect(sesInboundEvent(bounce)).toBeNull();
  });

  it("ignores payloads that are not notifications", () => {
    expect(parseSnsEnvelope({ hello: "world" })).toBeNull();
    expect(sesInboundEvent({ type: "email.received" })).toBeNull();
  });
});

describe("SES webhook identification and handshake", () => {
  it("claims deliveries carrying the notification header", () => {
    const result = sesEmailProvider.identifyWebhookRequest?.({
      headers: { "x-amz-sns-message-type": "Notification" },
      rawBody: "{}",
    });
    expect(result?.matched).toBe(true);
    expect(result?.provider).toBe("ses");
  });

  it("claims deliveries by envelope when headers are absent", () => {
    const payload = snsNotification();
    const result = sesEmailProvider.identifyWebhookRequest?.({
      headers: {},
      rawBody: JSON.stringify(payload),
      payload,
    });
    expect(result?.matched).toBe(true);
  });

  it("does not claim foreign payloads", () => {
    const result = sesEmailProvider.identifyWebhookRequest?.({
      headers: {},
      rawBody: "{}",
      payload: { type: "email.received", data: { from: "a@b.c" } },
    });
    expect(result?.matched).toBe(false);
  });

  it("returns no handshake for ordinary notifications", async () => {
    await expect(sesEmailProvider.handleWebhookHandshake?.(snsNotification())).resolves.toBeNull();
  });

  it("rejects a subscription confirmation without a URL", async () => {
    const result = await sesEmailProvider.handleWebhookHandshake?.({
      Type: "SubscriptionConfirmation",
      MessageId: "x",
      TopicArn: "arn:aws:sns:us-east-1:1:t",
      Message: "confirm",
      Timestamp: "2026-08-27T10:00:00.000Z",
    });
    expect(result?.status).toBe(400);
  });

  it("declares inbound support and the region MX requirement", async () => {
    expect(sesEmailProvider.capabilities.inbound).toBe(true);
    expect(sesEmailProvider.inboundSetupMode).toBe("dns_only");
    const status = await sesEmailProvider.getInboundStatus?.(
      { region: "eu-west-1" },
      "customer-domain.com",
    );
    expect(status?.records[0]?.type).toBe("MX");
    expect(status?.records[0]?.host).toBe("@");
    expect(status?.records[0]?.value).toContain("inbound-smtp.");
  });
});

describe("SNS signature primitives", () => {
  it("builds the canonical string in the documented field order", () => {
    const envelope = parseSnsEnvelope(snsNotification())!;
    const canonical = snsCanonicalString(envelope)!;
    expect(canonical.startsWith("Message\n")).toBe(true);
    expect(canonical).toContain("\nType\nNotification\n");
    expect(canonical.includes("Subject\n")).toBe(false);
  });

  it("uses the confirmation field set for subscription handshakes", () => {
    const envelope = parseSnsEnvelope({
      Type: "SubscriptionConfirmation",
      MessageId: "m",
      TopicArn: "arn:aws:sns:us-east-1:1:t",
      Message: "confirm",
      Timestamp: "2026-08-27T10:00:00.000Z",
      Token: "tok",
      SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
    })!;
    expect(snsCanonicalString(envelope)).toContain("SubscribeURL\n");
  });

  it("returns null when a certificate carries no RSA public key", () => {
    expect(spkiFromCertificate(Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x00]))).toBeNull();
  });
});
