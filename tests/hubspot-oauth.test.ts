import { beforeAll, describe, expect, it } from "vitest";

/**
 * Guards the security-critical parts of the HubSpot OAuth flow: the signed,
 * expiring state value, the exact scope set, the registered redirect URI and
 * the customer-safe error mapping. No network calls, no database, no real
 * HubSpot app — pure logic only.
 */
beforeAll(() => {
  process.env["PROVIDER_CREDENTIALS_KEY"] = "test-key-for-hubspot-state-only";
  process.env["HUBSPOT_CLIENT_ID"] = "test-client-id";
  process.env["HUBSPOT_CLIENT_SECRET"] = "test-secret";
});

describe("hubspot oauth state", () => {
  it("round-trips a signed state", async () => {
    const { signState, verifyState, newStateNonce } = await import("@/lib/hubspot.server");
    const nonce = newStateNonce();
    const state = signState({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      nonce,
      exp: Date.now() + 60_000,
    });
    const parsed = verifyState(state);
    expect(parsed?.workspaceId).toBe("11111111-1111-1111-1111-111111111111");
    expect(parsed?.nonce).toBe(nonce);
  });

  it("rejects a tampered workspace id", async () => {
    const { signState, verifyState } = await import("@/lib/hubspot.server");
    const state = signState({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      nonce: "abc",
      exp: Date.now() + 60_000,
    });
    const [body, sig] = state.split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as {
      workspaceId: string;
    };
    decoded.workspaceId = "33333333-3333-3333-3333-333333333333";
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${sig}`;
    expect(verifyState(forged)).toBeNull();
  });

  it("rejects an expired state and garbage", async () => {
    const { signState, verifyState } = await import("@/lib/hubspot.server");
    const expired = signState({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      nonce: "abc",
      exp: Date.now() - 1_000,
    });
    expect(verifyState(expired)).toBeNull();
    expect(verifyState("not-a-state")).toBeNull();
    expect(verifyState("")).toBeNull();
  });
});

describe("hubspot authorize url", () => {
  it("requests only the contact scopes on our registered callback", async () => {
    const { hubspotAuthorizeUrl, hubspotRedirectUri, HUBSPOT_SCOPES } = await import(
      "@/lib/hubspot.server"
    );
    const url = new URL(hubspotAuthorizeUrl("https://munchreach.com", "state123"));
    expect(url.origin + url.pathname).toBe("https://app.hubspot.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe(
      "crm.objects.contacts.read crm.objects.contacts.write",
    );
    expect([...HUBSPOT_SCOPES]).toHaveLength(2);
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://munchreach.com/api/public/integrations/hubspot/callback",
    );
    expect(hubspotRedirectUri("https://munchreach.com/")).toBe(
      "https://munchreach.com/api/public/integrations/hubspot/callback",
    );
  });
});

describe("hubspot customer errors", () => {
  it("never leaks HubSpot's machine codes", async () => {
    const { hubspotErrorForCustomer } = await import("@/lib/hubspot.server");
    const cases = [
      "http_400",
      "http_401",
      "http_403",
      "http_429",
      "http_500",
      "refresh_failed",
      "network:socket hang up",
      "weird_new_code",
    ];
    for (const code of cases) {
      const message = hubspotErrorForCustomer(code);
      expect(message).not.toContain(code);
      expect(message.length).toBeGreaterThan(10);
    }
  });
});

describe("hubspot catalog entry", () => {
  it("no longer asks the customer for a private app token", async () => {
    const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
    const meta = INTEGRATIONS_BY_SLUG["hubspot"];
    expect(meta?.authType).toBe("oauth");
    expect(meta?.fields ?? []).toHaveLength(0);
    expect(JSON.stringify(meta)).not.toMatch(/private app token/i);
  });
});
