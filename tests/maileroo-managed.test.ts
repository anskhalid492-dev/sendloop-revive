/**
 * Maileroo runs as MunchReach-managed infrastructure: customers never supply a
 * Maileroo credential, and the per-domain sending key is provisioned by the
 * backend from the MunchReach-owned account API key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MANAGED_SENDING_KEY_NAME,
  resetMailerooSendingKeyCache,
  resolveMailerooSendingKey,
} from "@/lib/email-providers/maileroo-sending-keys.server";
import { mailerooEmailProvider } from "@/lib/email-providers/maileroo.server";
import { PROVIDER_DEFINITIONS } from "@/lib/providers/registry";
import { PROVIDER_GUIDES } from "@/lib/provider-guides";

const ACCOUNT = { api_key: "roo_account_key" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Call = { url: string; init: RequestInit };

function mockFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const spy = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return calls;
}

/** Domain lookup responses shared by every scenario. */
function domainLookup(call: Call): Response | null {
  if (call.url.includes("/v1/domains?search=")) {
    return json({ data: [{ id: 77, domain_name: "example.com" }] });
  }
  if (/\/v1\/domains\/77$/.test(call.url)) {
    return json({ data: { id: 77, domain_name: "example.com" } });
  }
  return null;
}

beforeEach(() => resetMailerooSendingKeyCache());
afterEach(() => vi.unstubAllGlobals());

describe("managed Maileroo sending keys", () => {
  it("reuses the sending key MunchReach already provisioned for the domain", async () => {
    const calls = mockFetch((call) => {
      const lookup = domainLookup(call);
      if (lookup) return lookup;
      if (call.url.endsWith("/sending-keys") && (call.init.method ?? "GET") === "GET") {
        return json({ data: [{ id: 1, name: MANAGED_SENDING_KEY_NAME, sending_key: "sk_live" }] });
      }
      return json({ message: "unexpected" }, 500);
    });

    const result = await resolveMailerooSendingKey(ACCOUNT, "example.com");
    expect(result.key).toBe("sk_live");
    // No POST — an existing key must never be duplicated.
    expect(calls.some((c) => c.init.method === "POST")).toBe(false);
  });

  it("creates a sending key when the domain has none, then caches it", async () => {
    const calls = mockFetch((call) => {
      const lookup = domainLookup(call);
      if (lookup) return lookup;
      if (call.url.endsWith("/sending-keys") && (call.init.method ?? "GET") === "GET") {
        return json({ data: [] });
      }
      if (call.url.endsWith("/sending-keys") && call.init.method === "POST") {
        return json({ data: { id: 9, name: MANAGED_SENDING_KEY_NAME, sending_key: "sk_new" } });
      }
      return json({ message: "unexpected" }, 500);
    });

    expect((await resolveMailerooSendingKey(ACCOUNT, "example.com")).key).toBe("sk_new");
    const afterFirst = calls.length;
    expect((await resolveMailerooSendingKey(ACCOUNT, "EXAMPLE.com")).key).toBe("sk_new");
    expect(calls.length).toBe(afterFirst);
  });

  it("never asks a customer for a credential: no Maileroo key reaches the send call unresolved", async () => {
    mockFetch(() => json({ message: "should not be called" }, 500));
    const result = await mailerooEmailProvider.send!({}, {
      fromName: "MunchReach",
      fromEmail: "hello@example.com",
      to: "lead@acme.test",
      subject: "Hi",
      text: "Hello",
    } as never);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not configured/i);
  });

  it("sends with the resolved per-domain key, never with the account key", async () => {
    const calls = mockFetch((call) => {
      const lookup = domainLookup(call);
      if (lookup) return lookup;
      if (call.url.endsWith("/sending-keys")) {
        return json({ data: [{ id: 1, name: MANAGED_SENDING_KEY_NAME, sending_key: "sk_live" }] });
      }
      if (call.url.endsWith("/api/v2/emails")) {
        return json({ success: true, data: { reference_id: "ref-1" } });
      }
      return json({ message: "unexpected" }, 500);
    });

    const result = await mailerooEmailProvider.send!(ACCOUNT, {
      fromName: "MunchReach",
      fromEmail: "hello@example.com",
      to: "lead@acme.test",
      subject: "Hi",
      text: "Hello",
    } as never);

    expect(result.ok).toBe(true);
    const send = calls.find((c) => c.url.endsWith("/api/v2/emails"))!;
    const headers = send.init.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("sk_live");
    expect(headers["X-Api-Key"]).not.toBe(ACCOUNT.api_key);
  });
});

describe("credential surface", () => {
  it("asks admins for the account API key only", () => {
    const definition = PROVIDER_DEFINITIONS.find((d) => d.id === "maileroo")!;
    expect(definition.fields.map((f) => f.name)).toEqual(["api_key"]);
    expect(PROVIDER_GUIDES["maileroo"].fieldHints).not.toHaveProperty("sending_key");
  });
});
