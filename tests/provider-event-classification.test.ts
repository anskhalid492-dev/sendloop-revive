import { describe, expect, it } from "vitest";

import { classifyEvent, normalizeDelivery } from "../src/lib/inbound-parse";

/**
 * Delivery/tracking webhooks that label themselves with `event_type` used to be
 * classified as inbound mail, so real bounces and clicks were discarded with
 * "Payload has no sender or recipient" / "No workspace matched this email".
 */
describe("provider event classification", () => {
  const bounce = {
    domain_id: 102869,
    event_type: "failed",
    event_id: "b8746d06",
    message_reference_id: "24d7086ed987a0d531b678b6",
    message_id: "<2383327354@meetsmartoutreach.agency>",
    event_data: {
      to: "bhardem@aol.com",
      reason: "Sorry, your message to bhardem@aol.com cannot be delivered. This mailbox is disabled (554.30).",
    },
  };

  it("classifies event_type payloads as delivery events, not inbound mail", () => {
    expect(classifyEvent(bounce)).toBe("failed");
    expect(classifyEvent({ event_type: "clicked", event_data: { original_url: "https://x" } })).toBe("clicked");
    expect(classifyEvent({ event_type: "opened", event_data: {} })).toBe("opened");
    expect(classifyEvent({ event_type: "delivered", event_data: {} })).toBe("delivered");
  });

  it("treats an accepted handoff as the provider's sent confirmation", () => {
    expect(
      classifyEvent({
        event_type: "accepted",
        event_data: { from: ["bounces+abc@example.com"], to: ["lead@gmail.com"] },
      }),
    ).toBe("sent");
  });

  it("still treats a genuine inbound message envelope as inbound", () => {
    expect(classifyEvent({ from: "lead@gmail.com", to: "rep@example.com", subject: "Re: hi" })).toBe("inbound");
    expect(classifyEvent({ type: "email.received", data: { from: "a@b.com" } })).toBe("inbound");
  });

  it("resolves the send id from the event envelope", () => {
    const delivery = normalizeDelivery(bounce);
    expect(delivery.providerMessageId).toBe("24d7086ed987a0d531b678b6");
    expect(delivery.email).toBe("bhardem@aol.com");
    expect(delivery.reason).toContain("mailbox is disabled");
  });
});
