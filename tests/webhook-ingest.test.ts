import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=";

process.env["RESEND_WEBHOOK_SECRET"] = SECRET;

const INBOUND_PAYLOAD = {
  type: "email.received",
  created_at: "2026-08-26T12:00:00.000Z",
  data: {
    email_id: "5f1a2b3c-1111-2222-3333-444455556666",
    from: "Mike James <mikejamesbond120@gmail.com>",
    to: ["reply+abc123@munchreach.com"],
    cc: ["watcher@munchreach.com"],
    subject: "Re: Quick question about your kitchen",
    text: "Sure, let's talk tomorrow.",
    html: "<p>Sure, let's talk tomorrow.</p>",
    headers: [
      { name: "Message-ID", value: "<CAG-inbound-1@mail.gmail.com>" },
      { name: "In-Reply-To", value: "<outbound-42@munchreach.com>" },
      { name: "References", value: "<outbound-41@munchreach.com> <outbound-42@munchreach.com>" },
    ],
  },
};

async function svixHeaders(body: string, secret = SECRET) {
  const id = "msg_test_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  let binary = "";
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${btoa(binary)}`,
  };
}

function request(body: string, headers: Record<string, string>) {
  return new Request("https://munchreach.com/api/public/inbound/email", {
    method: "POST",
    headers,
    body,
  });
}

let ingest: typeof import("@/lib/email-providers/ingest.server");
let provider: typeof import("@/lib/email-providers/resend.server").resendEmailProvider;

beforeAll(async () => {
  ingest = await import("@/lib/email-providers/ingest.server");
  provider = (await import("@/lib/email-providers/resend.server")).resendEmailProvider;
});

describe("provider identification", () => {
  it("claims a delivery carrying Svix headers (exact discriminator)", () => {
    const result = provider.identifyWebhookRequest!({
      headers: { "svix-signature": "v1,x" },
      rawBody: "{}",
    });
    expect(result).toMatchObject({ provider: "resend", matched: true, confidence: "exact" });
  });

  it("claims a shared-secret delivery by payload envelope", () => {
    const result = provider.identifyWebhookRequest!({
      headers: {},
      rawBody: JSON.stringify(INBOUND_PAYLOAD),
      payload: INBOUND_PAYLOAD,
    });
    expect(result.matched).toBe(true);
    expect(result.confidence).toBe("likely");
  });

  it("rejects an unknown sender instead of defaulting to a provider", async () => {
    const body = JSON.stringify({ hello: "world" });
    const result = await ingest.ingestProviderWebhook(
      request(body, { "content-type": "application/json" }),
      body,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/Unrecognised webhook sender/);
      expect(result.provider).toBeUndefined();
    }
  });
});

describe("signature verification", () => {
  it("accepts a valid signature over the raw body", async () => {
    const body = JSON.stringify(INBOUND_PAYLOAD);
    const result = await ingest.ingestProviderWebhook(request(body, await svixHeaders(body)), body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.verification.status).toBe("valid");
  });

  // The reject path deliberately spends time on constant-work verification, so
  // it sits right at the default 5s budget on a loaded machine.
  it("rejects an invalid signature", { timeout: 20_000 }, async () => {
    const body = JSON.stringify(INBOUND_PAYLOAD);
    const headers = await svixHeaders(body);
    headers["svix-signature"] = "v1,YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3OA==";
    const result = await ingest.ingestProviderWebhook(request(body, headers), body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects a tampered body signed for different bytes", async () => {
    const original = JSON.stringify(INBOUND_PAYLOAD);
    const headers = await svixHeaders(original);
    const tampered = JSON.stringify({
      ...INBOUND_PAYLOAD,
      data: { ...INBOUND_PAYLOAD.data, from: "attacker@evil.example" },
    });
    const result = await ingest.ingestProviderWebhook(request(tampered, headers), tampered);
    expect(result.ok).toBe(false);
  });

  it("verifies the exact raw string it was given, not a re-serialised copy", async () => {
    // Whitespace-different but semantically identical JSON must fail: proof the
    // raw body is what gets verified.
    const signedBody = JSON.stringify(INBOUND_PAYLOAD);
    const headers = await svixHeaders(signedBody);
    const reserialised = JSON.stringify(INBOUND_PAYLOAD, null, 2);
    const bad = await ingest.ingestProviderWebhook(request(reserialised, headers), reserialised);
    expect(bad.ok).toBe(false);
    const good = await ingest.ingestProviderWebhook(request(signedBody, headers), signedBody);
    expect(good.ok).toBe(true);
  });
});

describe("resend inbound normalization", () => {
  it("preserves every field the reply pipeline relies on", () => {
    const event = provider.parseInboundEvent!(INBOUND_PAYLOAD)!;
    expect(event.provider).toBe("resend");
    expect(event.providerEventId).toContain("inbound:");
    expect(event.providerMessageId).toBe("5f1a2b3c-1111-2222-3333-444455556666");
    expect(event.from).toContain("mikejamesbond120@gmail.com");
    expect(event.to).toEqual(["reply+abc123@munchreach.com"]);
    expect(event.cc).toEqual(["watcher@munchreach.com"]);
    expect(event.subject).toBe("Re: Quick question about your kitchen");
    expect(event.text).toContain("tomorrow");
    expect(event.html).toContain("<p>");
    expect(event.receivedAt).toBe("2026-08-26T12:00:00.000Z");
  });

  it("preserves Message-ID", () => {
    expect(provider.parseInboundEvent!(INBOUND_PAYLOAD)!.messageId).toBe(
      "<CAG-inbound-1@mail.gmail.com>",
    );
  });

  it("preserves In-Reply-To", () => {
    expect(provider.parseInboundEvent!(INBOUND_PAYLOAD)!.inReplyTo).toBe(
      "<outbound-42@munchreach.com>",
    );
  });

  it("preserves References", () => {
    expect(provider.parseInboundEvent!(INBOUND_PAYLOAD)!.references).toEqual([
      "<outbound-41@munchreach.com> <outbound-42@munchreach.com>",
    ]);
  });

  it("returns null for delivery (non-reply) events", () => {
    expect(
      provider.parseInboundEvent!({ type: "email.delivered", data: { email_id: "abc" } }),
    ).toBeNull();
  });
});

describe("existing processor compatibility", async () => {
  const { classifyEvent, externalIdOf, normalizeInbound } = await import("@/lib/inbound-parse");

  it("normalized output matches what the existing processor derives from the raw payload", async () => {
    const legacy = normalizeInbound(INBOUND_PAYLOAD as Record<string, unknown>)!;
    const kind = classifyEvent(INBOUND_PAYLOAD as Record<string, unknown>);
    const p = (await import("@/lib/email-providers/resend.server")).resendEmailProvider;
    const event = p.parseInboundEvent!(INBOUND_PAYLOAD)!;
    expect(kind).toBe("inbound");
    expect(event.from).toBe(legacy["from"]);
    expect(event.to[0]).toBe(legacy["to"]);
    expect(event.messageId).toBe(legacy["messageId"]);
    expect(event.inReplyTo).toBe(legacy["inReplyTo"]);
    expect(event.providerEventId).toBe(
      externalIdOf(INBOUND_PAYLOAD as Record<string, unknown>, kind),
    );
  });

  it("hands the untouched raw payload through ingestion", async () => {
    const body = JSON.stringify(INBOUND_PAYLOAD);
    const result = await ingest.ingestProviderWebhook(request(body, await svixHeaders(body)), body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(INBOUND_PAYLOAD);
  });
});
