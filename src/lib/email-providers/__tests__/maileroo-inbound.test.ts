import { describe, expect, it } from "vitest";
import {
  isMailerooInboundPayload,
  mailerooFlattenInboundPayload,
  mailerooInboundEvent,
} from "../maileroo-inbound";

const payload = {
  _id: "abc123",
  message_id: "<CAF=reply@mail.gmail.com>",
  domain: "meetsmartoutreach.agency",
  envelope_sender: "lead@example.com",
  recipients: ["sarah+ml_abc123@meetsmartoutreach.agency"],
  headers: {
    Subject: ["Re: Quick question"],
    From: ["Lead Person <lead@example.com>"],
    To: ["sarah+ml_abc123@meetsmartoutreach.agency"],
    "Message-ID": ["<CAF=reply@mail.gmail.com>"],
    "In-Reply-To": ["<original@munchreach.com>"],
    References: ["<first@munchreach.com> <original@munchreach.com>"],
  },
  body: {
    plaintext: "Sounds good!\n\nOn Tue, Sep 15, 2026, Sarah <sarah@x.com> wrote:\n> pitch",
    stripped_plaintext: "Sounds good!",
    html: "<p>Sounds good!</p><blockquote>pitch</blockquote>",
    stripped_html: "<p>Sounds good!</p>",
  },
  attachments: [
    { filename: "deck.pdf", content_type: "application/pdf", url: "https://x/deck.pdf", size: 12 },
  ],
  spf_result: "pass",
  dkim_result: true,
  is_dmarc_aligned: true,
  is_spam: false,
  validation_url: "https://api.maileroo.com/validate/xyz",
  processed_at: 1_789_000_000,
};

describe("maileroo inbound translator", () => {
  it("recognises only the inbound envelope", () => {
    expect(isMailerooInboundPayload(payload)).toBe(true);
    expect(isMailerooInboundPayload({ event_type: "delivered", message_reference_id: "x" })).toBe(false);
    expect(isMailerooInboundPayload({})).toBe(false);
  });

  it("flattens envelope sender/recipients and array headers", () => {
    const flat = mailerooFlattenInboundPayload(payload)!;
    const data = flat["data"] as Record<string, unknown>;
    expect(flat["type"]).toBe("email.received");
    expect(data["from"]).toBe("Lead Person <lead@example.com>");
    expect(data["to"]).toEqual([
      "sarah+ml_abc123@meetsmartoutreach.agency",
      "sarah+ml_abc123@meetsmartoutreach.agency",
    ]);
    expect(data["subject"]).toBe("Re: Quick question");
    expect(data["in-reply-to"]).toBe("<original@munchreach.com>");
  });

  it("prefers the provider's quote-stripped body and keeps the raw version", () => {
    const data = mailerooFlattenInboundPayload(payload)!["data"] as Record<string, unknown>;
    expect(data["text"]).toBe("Sounds good!");
    expect(data["html"]).toBe("<p>Sounds good!</p>");
    expect(String(data["raw_text"])).toContain("wrote:");
  });

  it("produces a threadable inbound event", () => {
    const event = mailerooInboundEvent(payload)!;
    expect(event.provider).toBe("maileroo");
    expect(event.from).toBe("Lead Person <lead@example.com>");
    expect(event.to[0]).toBe("sarah+ml_abc123@meetsmartoutreach.agency");
    expect(event.messageId).toBe("<CAF=reply@mail.gmail.com>");
    expect(event.inReplyTo).toBe("<original@munchreach.com>");
    expect(event.references).toEqual(["<first@munchreach.com> <original@munchreach.com>"]);
    expect(event.attachments?.[0]?.url).toBe("https://x/deck.pdf");
    expect(event.receivedAt).toBe(new Date(1_789_000_000 * 1000).toISOString());
  });

  it("ignores delivery events and malformed payloads", () => {
    expect(mailerooInboundEvent({ event_type: "delivered" })).toBeNull();
    expect(mailerooInboundEvent({ envelope_sender: "a@b.c", recipients: [], body: {} })).toBeNull();
  });
});

describe("maileroo inbound wiring", () => {
  it("claims an inbound payload at the shared endpoint", async () => {
    const { mailerooEmailProvider } = await import("../maileroo.server");
    const claim = mailerooEmailProvider.identifyWebhookRequest!({
      headers: {},
      rawBody: JSON.stringify(payload),
      payload,
    } as never);
    expect(claim.matched).toBe(true);
    expect(mailerooEmailProvider.normalizeWebhookPayload!(payload as never)!["type"]).toBe(
      "email.received",
    );
    expect(mailerooEmailProvider.parseInboundEvent!(payload)!.subject).toBe("Re: Quick question");
  });
});
