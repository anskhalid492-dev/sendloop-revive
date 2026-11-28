import { describe, expect, it, vi } from "vitest";
import { microsoftConfig, MICROSOFT_REDIRECT_URI, MICROSOFT_SCOPES, prepareMicrosoftConsent,
  validateTransaction, sealTransaction, pkceChallenge, verifyMicrosoftCode } from "@/lib/microsoft-oauth.server";

// Offline-only fixtures. No environment credentials, customer records, or provider calls.
const config = microsoftConfig({ clientId: "11111111-1111-4111-8111-111111111111",
  clientSecret: "offline-only-test-fixture-not-a-provider-credential", tenantId: "organizations", redirectUri: MICROSOFT_REDIRECT_URI });
const userId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const now = 1_800_000_000_000;

async function transaction() {
  const prepared = await prepareMicrosoftConsent(config, userId, workspaceId, now);
  const state = new URL(prepared.authorizationUrl).searchParams.get("state") ?? "";
  const tx = await validateTransaction(config, prepared.cookie, state, now);
  if (!tx) throw new Error("Fixture transaction failed");
  return { prepared, state, tx };
}
describe("Microsoft mailbox OAuth preparation", () => {
  it("fails closed without any of the four required settings", () => {
    for (const field of ["clientId", "clientSecret", "tenantId", "redirectUri"]) {
      const input: Record<string, unknown> = { ...config }; delete input[field];
      expect(() => microsoftConfig(input)).toThrow("not configured");
    }
  });
  it("rejects arbitrary redirect destinations and tenant URL injection", () => {
    expect(() => microsoftConfig({ ...config, redirectUri: "https://evil.example/callback" })).toThrow();
    expect(() => microsoftConfig({ ...config, tenantId: "../../evil" })).toThrow();
    expect(() => microsoftConfig({ ...config, tenantId: "common" })).toThrow();
  });
  it("requests exactly the seven delegated scopes, production callback and S256 code flow", async () => {
    const { prepared, tx } = await transaction();
    const url = new URL(prepared.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "https://graph.microsoft.com/Mail.Send", "https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/User.Read",
      "openid", "profile", "email", "offline_access",
    ]);
    expect(url.searchParams.get("redirect_uri")).toBe("https://munchreach.com/api/public/integrations/microsoft/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(await pkceChallenge(tx.verifier));
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.has("code_verifier")).toBe(false);
  });
  it("matches the RFC 7636 S256 vector", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("rejects missing, mismatched, tampered, cross-app and expired state", async () => {
    const { prepared, state } = await transaction();
    expect(await validateTransaction(config, "", state, now)).toBeNull();
    expect(await validateTransaction(config, prepared.cookie, "wrong", now)).toBeNull();
    expect(await validateTransaction(config, `A${prepared.cookie}`, state, now)).toBeNull();
    expect(await validateTransaction({ ...config, clientId: userId }, prepared.cookie, state, now)).toBeNull();
    expect(await validateTransaction({ ...config, tenantId: workspaceId }, prepared.cookie, state, now)).toBeNull();
    expect(await validateTransaction(config, prepared.cookie, state, now + 600_000)).toBeNull();
  });
  it("rejects future-issued and excessively long transactions", async () => {
    const { tx, state } = await transaction();
    const future = await sealTransaction(config, { ...tx, issuedAt: now + 1, expiresAt: now + 600_001 });
    expect(await validateTransaction(config, future, state, now)).toBeNull();
    const excessive = await sealTransaction(config, { ...tx, expiresAt: now + 600_001 });
    expect(await validateTransaction(config, excessive, state, now)).toBeNull();
  });
  it("uses independent state/verifiers for each initiation", async () => {
    const a = await transaction(), b = await transaction();
    expect(a.state).not.toBe(b.state);
    expect(a.tx.verifier).not.toBe(b.tx.verifier);
  });
  it("exchanges the code only server-side and verifies Graph without returning tokens", async () => {
    const { tx } = await transaction();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "offline-access-fixture",
      refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: MICROSOFT_SCOPES.join(" ") }))
      .mockResolvedValueOnce(Response.json({ id: "throwaway-microsoft-identity" }));
    expect(await verifyMicrosoftCode(config, tx, "offline-code", fetcher)).toBeUndefined();
    const first = fetcher.mock.calls[0];
    if (!first) throw new Error("Missing token request");
    expect(first[0]).toBe("https://login.microsoftonline.com/organizations/oauth2/v2.0/token");
    const body = first[1]?.body;
    if (!(body instanceof URLSearchParams)) throw new Error("Missing form body");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe(tx.verifier);
    expect(body.get("redirect_uri")).toBe(MICROSOFT_REDIRECT_URI);
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://graph.microsoft.com/v1.0/me?$select=id");
  });
  it("rejects replayed codes without disclosing provider bodies", async () => {
    const { tx } = await transaction();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "invalid_grant", detail: "sensitive-provider-body" }, { status: 400 }));
    await expect(verifyMicrosoftCode(config, tx, "already-used-code", fetcher)).rejects.toThrow("Microsoft authorization exchange failed.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects incomplete consent, absent refresh token, and failed identity verification", async () => {
    const { tx } = await transaction();
    const missingScope = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: "offline-access-fixture",
      refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: "User.Read Mail.Read" }));
    await expect(verifyMicrosoftCode(config, tx, "offline-code", missingScope)).rejects.toThrow("permissions were not granted");
    expect(missingScope).toHaveBeenCalledTimes(1);
    const missingRefresh = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: "offline-access-fixture", token_type: "Bearer", scope: "Mail.Send Mail.Read User.Read" }));
    await expect(verifyMicrosoftCode(config, tx, "offline-code", missingRefresh)).rejects.toThrow("incomplete");
    const badIdentity = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "offline-access-fixture", refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: "Mail.Send Mail.Read User.Read" }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(verifyMicrosoftCode(config, tx, "offline-code", badIdentity)).rejects.toThrow("account verification failed");
  });
});