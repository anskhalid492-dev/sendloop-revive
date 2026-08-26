/**
 * Phase 4 — provider-agnostic outbound sending + delivery/tracking events.
 * No production data or network access: the provider HTTP layer is stubbed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractResendMessageId,
  resendEventType,
} from "@/lib/email-providers/resend-send.server";
import { deliveryStateForEvent } from "@/lib/delivery-reconcile.server";
import { resendEmailProvider } from "@/lib/email-providers/resend.server";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const message = {
  fromName: "Mike",
  fromEmail: "mike@example.com",
  to: "prospect@example.com",
  subject: "Hello",
  text: "Body",
};

describe("resend send adapter", () => {
  it("returns a normalized success result with provider + RFC message ids", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      calls.push(href);
      if (href.endsWith("/emails")) return jsonResponse({ id: "prov-123" }, 200);
      return jsonResponse({ id: "prov-123", headers: { "Message-ID": "<rfc-1@example.com>" } });
    }) as unknown as typeof fetch;

    const result = await resendEmailProvider.send!({ api_key: "k" }, message);
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("prov-123");
    expect(result.rfcMessageId).toBe("<rfc-1@example.com>");
    expect(result.statusCode).toBe(200);
    expect(calls[0]).toBe("https://api.resend.com/emails");
    expect(calls[1]).toBe("https://api.resend.com/emails/prov-123");
  });

  it("normalizes a send failure without inventing an id", async () => {
    globalThis.fetch = vi.fn(async () => new Response("domain not verified", { status: 403 })) as
      unknown as typeof fetch;
    const result = await resendEmailProvider.send!({ api_key: "k" }, message);
    expect(result.ok).toBe(false);
    expect(result.providerMessageId ?? null).toBeNull();
    expect(result.rfcMessageId ?? null).toBeNull();
    expect(result.message).toContain("403");
  });

  it("extracts the provider message id from nested and header shapes", () => {
    const headers = new Headers();
    expect(extractResendMessageId(JSON.stringify({ id: "a" }), headers)).toBe("a");
    expect(extractResendMessageId(JSON.stringify({ data: { email_id: "b" } }), headers)).toBe("b");
    expect(extractResendMessageId("not json", new Headers({ "x-message-id": "c" }))).toBe("c");
    expect(extractResendMessageId("not json", headers)).toBeUndefined();
  });
});

describe("event normalization", () => {
  const cases: [string, string][] = [
    ["email.sent", "SENT"],
    ["email.delivered", "DELIVERED"],
    ["email.delivery_delayed", "DELAYED"],
    ["email.opened", "OPENED"],
    ["email.clicked", "CLICKED"],
    ["email.bounced", "BOUNCED"],
    ["email.failed", "FAILED"],
    ["email.complained", "COMPLAINED"],
  ];

  for (const [native, normalized] of cases) {
    it(`maps ${native} to ${normalized}`, () => {
      expect(resendEventType(native)).toBe(normalized);
      const parsed = resendEmailProvider.parseDeliveryEvent!({
        type: native,
        data: { email_id: "prov-9", to: ["p@example.com"] },
      });
      expect(parsed?.type).toBe(normalized);
      expect(parsed?.provider).toBe("resend");
      expect(parsed?.providerMessageId).toBe("prov-9");
    });
  }

  it("keeps unknown events UNKNOWN and never upgrades them", () => {
    expect(resendEventType("email.something_new")).toBe("UNKNOWN");
    expect(resendEventType(undefined)).toBe("UNKNOWN");
    const parsed = resendEmailProvider.parseTrackingEvent!({ type: "email.mystery", data: {} });
    expect(parsed?.type).toBe("UNKNOWN");
    expect(deliveryStateForEvent("UNKNOWN")).toBeNull();
  });

  it("maps normalized events to the existing delivery states", () => {
    expect(deliveryStateForEvent("SENT")).toBe("sent");
    expect(deliveryStateForEvent("ACCEPTED")).toBe("sent");
    expect(deliveryStateForEvent("DELAYED")).toBe("delayed");
    expect(deliveryStateForEvent("DELIVERED")).toBe("delivered");
    expect(deliveryStateForEvent("OPENED")).toBe("opened");
    expect(deliveryStateForEvent("CLICKED")).toBe("clicked");
    expect(deliveryStateForEvent("BOUNCED")).toBe("bounced");
    expect(deliveryStateForEvent("FAILED")).toBe("failed");
  });
});

describe("provider send status + capabilities", () => {
  it("reports a known normalized status from the provider log", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ last_event: "delivered" })) as
      unknown as typeof fetch;
    const status = await resendEmailProvider.getSendStatus!({ api_key: "k" }, "prov-1");
    expect(status.known).toBe(true);
    expect(status.status).toBe("DELIVERED");
  });

  it("reports unknown for an unrecognized provider state", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ last_event: "brand_new" })) as
      unknown as typeof fetch;
    const status = await resendEmailProvider.getSendStatus!({ api_key: "k" }, "prov-1");
    expect(status.known).toBe(false);
    expect(status.status).toBeNull();
  });

  it("declares the capabilities reconciliation checks", () => {
    expect(resendEmailProvider.capabilities.delivery_tracking).toBe(true);
    expect(resendEmailProvider.capabilities.open_tracking).toBe(true);
    expect(resendEmailProvider.capabilities.click_tracking).toBe(true);
  });

  it("treats an unregistered provider as webhook-only", async () => {
    const { getEmailProvider } = await import("@/lib/email-providers/registry.server");
    const unknown = getEmailProvider("mailgun");
    expect(unknown.getSendStatus).toBeUndefined();
    expect(unknown.capabilities.delivery_tracking).toBe(false);
  });
});
