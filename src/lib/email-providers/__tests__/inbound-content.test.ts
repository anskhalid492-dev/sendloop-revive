import { describe, expect, it, vi } from "vitest";
import { enrichInboundPayload } from "../inbound-content.server";
import { resendEmailProvider } from "../resend.server";
import { capabilities } from "../types";
import type { EmailProvider } from "../provider";

const basePayload = (source: Record<string, unknown> = {}) => ({
  type: "email.received",
  data: {
    email_id: "evt_123",
    from: "prospect@example.com",
    to: ["sales@customer.com"],
    subject: "Re: hello",
    ...source,
  },
});

const inboundEvent = (overrides: Partial<import("../types").InboundEmailEvent> = {}) =>
  ({
    provider: "mock",
    from: "prospect@example.com",
    to: ["sales@customer.com"],
    providerMessageId: "evt_123",
    ...overrides,
  } as import("../types").InboundEmailEvent);

function fakeProvider(content: import("../types").InboundMessageContent | null, throws = false): EmailProvider {
  return {
    id: "mock",
    label: "Mock",
    capabilities: capabilities({ inbound: true, inbound_content: true }),
    inboundSetupMode: "api",
    async getInboundMessageContent() {
      if (throws) throw new Error("provider down");
      return content;
    },
  };
}

describe("enrichInboundPayload", () => {
  it("returns the payload unchanged when there is no provider message id", async () => {
    const payload = basePayload();
    const result = await enrichInboundPayload(
      fakeProvider({ text: "body" }),
      payload,
      inboundEvent({ providerMessageId: null }),
    );
    expect(result).toBe(payload);
    expect((result as Record<string, unknown>).data).not.toHaveProperty("text");
  });

  it("returns the payload unchanged when the provider lacks inbound_content", async () => {
    const payload = basePayload();
    const provider = fakeProvider({ text: "body" });
    provider.capabilities = capabilities({ inbound: true, inbound_content: false });
    const result = await enrichInboundPayload(provider, payload, inboundEvent());
    expect(result).toBe(payload);
    expect((result as Record<string, unknown>).data).not.toHaveProperty("text");
  });

  it("does not fetch when the payload already contains text", async () => {
    const fetchSpy = vi.fn();
    const payload = basePayload({ text: "already here" });
    const provider = fakeProvider({ text: "fetched" });
    provider.getInboundMessageContent = fetchSpy as never;
    const result = await enrichInboundPayload(provider, payload, inboundEvent());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((result as Record<string, unknown>).data).toHaveProperty("text", "already here");
  });

  it("fetches and stores text content when the webhook has only an email_id", async () => {
    const payload = basePayload();
    const result = await enrichInboundPayload(fakeProvider({ text: "Hello back" }), payload, inboundEvent());
    expect((result as Record<string, unknown>).data).toHaveProperty("text", "Hello back");
  });

  it("fetches and stores html content", async () => {
    const payload = basePayload();
    const result = await enrichInboundPayload(
      fakeProvider({ html: "<p>Hello back</p>" }),
      payload,
      inboundEvent(),
    );
    expect((result as Record<string, unknown>).data).toHaveProperty("html", "<p>Hello back</p>");
  });

  it("stores both text and html when the provider returns both", async () => {
    const payload = basePayload();
    const result = await enrichInboundPayload(
      fakeProvider({ text: "Plain text", html: "<p>HTML</p>" }),
      payload,
      inboundEvent(),
    );
    expect((result as Record<string, unknown>).data).toHaveProperty("text", "Plain text");
    expect((result as Record<string, unknown>).data).toHaveProperty("html", "<p>HTML</p>");
  });

  it("logs and swallows a content-fetch failure without rejecting the inbound email", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const payload = basePayload();
    const result = await enrichInboundPayload(fakeProvider(null, true), payload, inboundEvent());
    expect(result).toBe(payload);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("provider down"));
    errorSpy.mockRestore();
  });

  it("keeps existing empty messages intact when the provider returns no content", async () => {
    const payload = basePayload();
    const result = await enrichInboundPayload(fakeProvider(null), payload, inboundEvent());
    expect(result).toBe(payload);
    expect((result as Record<string, unknown>).data).not.toHaveProperty("text");
    expect((result as Record<string, unknown>).data).not.toHaveProperty("html");
  });

  it("does not overwrite pre-existing content fields", async () => {
    const payload = basePayload({ text: "original text", html: "<b>original</b>" });
    const result = await enrichInboundPayload(
      fakeProvider({ text: "new text", html: "<p>new</p>" }),
      payload,
      inboundEvent(),
    );
    expect((result as Record<string, unknown>).data).toHaveProperty("text", "original text");
    expect((result as Record<string, unknown>).data).toHaveProperty("html", "<b>original</b>");
  });
});

describe("Resend getInboundMessageContent", () => {
  it("hits the received-email endpoint and returns text/html", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "evt_123", text: "Resend body", html: "<p>Resend body</p>" }),
    }) as never;

    const result = await resendEmailProvider.getInboundMessageContent?.({}, "evt_123");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/evt_123",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
    );
    expect(result).toEqual({ text: "Resend body", html: "<p>Resend body</p>" });

    globalThis.fetch = originalFetch;
  });

  it("returns null when the received-email endpoint responds non-OK", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as never;

    const result = await resendEmailProvider.getInboundMessageContent?.({}, "evt_123");
    expect(result).toBeNull();

    globalThis.fetch = originalFetch;
  });
});
