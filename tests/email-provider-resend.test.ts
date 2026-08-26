import { describe, expect, it } from "vitest";
import { resendEmailProvider } from "@/lib/email-providers/resend.server";
import { getEmailProvider, isEmailProviderRegistered } from "@/lib/email-providers/registry.server";
import { extractRfcMessageId } from "@/lib/email-providers/resend-api.server";

describe("resend provider adapter", () => {
  it("is registered and resolvable through the registry", () => {
    expect(isEmailProviderRegistered("resend")).toBe(true);
    expect(getEmailProvider("resend")).toBe(resendEmailProvider);
  });

  it("declares only the capabilities the existing integration supports", () => {
    expect(resendEmailProvider.capabilities).toMatchObject({
      sending: true,
      inbound: true,
      delivery_tracking: true,
      webhooks: true,
      domain_api: true,
      dns_api: true,
    });
  });

  it("exposes the domain, dns, inbound and message-id operations", () => {
    for (const method of [
      "send",
      "getSendStatus",
      "getRfcMessageId",
      "verifyDomain",
      "getDomainStatus",
      "getDnsRequirements",
      "enableInbound",
      "getInboundStatus",
      "configureWebhooks",
      "verifyWebhookSignature",
      "identifyWebhookRequest",
      "parseInboundEvent",
      "parseDeliveryEvent",
    ] as const) {
      expect(typeof resendEmailProvider[method]).toBe("function");
    }
  });

  it("identifies signed provider webhooks by their headers", () => {
    expect(
      resendEmailProvider.identifyWebhookRequest?.({
        headers: { "Svix-Signature": "v1,abc" },
        rawBody: "{}",
      })?.matched,
    ).toBe(true);
    expect(
      resendEmailProvider.identifyWebhookRequest?.({ headers: {}, rawBody: "{}" })?.matched,
    ).toBe(false);
  });

  it("finds the RFC message id in nested provider payloads", () => {
    expect(extractRfcMessageId({ headers: [{ name: "Message-ID", value: "<abc@mail>" }] })).toBe(
      "<abc@mail>",
    );
    expect(extractRfcMessageId({ data: { message_id: "<x@y>" } })).toBe("<x@y>");
    expect(extractRfcMessageId({ nope: 1 })).toBeUndefined();
  });
});
