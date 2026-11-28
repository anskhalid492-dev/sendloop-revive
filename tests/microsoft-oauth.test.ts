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
    expect(() => microsoftConfig({ ...config, tenantId: "common/../organizations" })).toThrow();
    expect(() => microsoftConfig({ ...config, tenantId: "" })).toThrow();
  });
  it("accepts a single-tenant directory id and the multitenant endpoint aliases", async () => {
    for (const tenantId of ["44444444-4444-4444-8444-444444444444", "organizations", "common", "consumers"]) {
      const scoped = microsoftConfig({ ...config, tenantId });
      expect(scoped.tenantId).toBe(tenantId);
      const prepared = await prepareMicrosoftConsent(scoped, userId, workspaceId, now);
      expect(new URL(prepared.authorizationUrl).pathname).toBe(`/${tenantId}/oauth2/v2.0/authorize`);
    }
  });
  it("requests exactly the seven delegated scopes, production callback and S256 code flow", async () => {
    const { prepared, tx } = await transaction();
    const url = new URL(prepared.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe(`/${tx.tenantId}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get("scope")).toBe("openid profile email offline_access User.Read Mail.Read Mail.Send");
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
  it("exchanges the code server-side with the PKCE verifier and reads the Microsoft identity", async () => {
    const { tx } = await transaction();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "offline-access-fixture",
      refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: MICROSOFT_SCOPES.join(" ") }))
      .mockResolvedValueOnce(Response.json({ id: "throwaway-microsoft-identity", mail: "Throwaway@Example.test" }));
    const grant = await verifyMicrosoftCode(config, tx, "offline-code", fetcher);
    expect(grant.profile).toEqual({ id: "throwaway-microsoft-identity", email: "throwaway@example.test", displayName: null });
    const first = fetcher.mock.calls[0];
    if (!first) throw new Error("Missing token request");
    expect(first[0]).toBe("https://login.microsoftonline.com/organizations/oauth2/v2.0/token");
    const body = first[1]?.body;
    if (!(body instanceof URLSearchParams)) throw new Error("Missing form body");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe(tx.verifier);
    expect(body.get("redirect_uri")).toBe(MICROSOFT_REDIRECT_URI);
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName");
  });
  it.each([
    { mail: "Mail@Example.test", upn: "upn@example.test", preferred: "preferred@example.test", email: "email@example.test", expected: "mail@example.test" },
    { mail: null, upn: "UPN@Example.test", preferred: "preferred@example.test", email: "email@example.test", expected: "upn@example.test" },
    { mail: "  ", upn: null, preferred: "Preferred@Example.test", email: "email@example.test", expected: "preferred@example.test" },
    { mail: null, upn: "", preferred: "  ", email: " Email@Example.test ", expected: "email@example.test" },
    { mail: "not-an-email", upn: "UPN@Example.test", preferred: "preferred@example.test", email: "email@example.test", expected: "upn@example.test" },
    { mail: null, upn: "personal-account-id", preferred: "Preferred@Example.test", email: "email@example.test", expected: "preferred@example.test" },
    { mail: "invalid", upn: "personal-account-id", preferred: "not-an-email", email: "Email@Example.test", expected: "email@example.test" },
    { mail: null, upn: "personal-account-id", preferred: null, email: "Email@Example.test", expected: "email@example.test" },
  ])("resolves the mailbox in mail → UPN → preferred_username → email order: $expected", async ({ mail, upn, preferred, email, expected }) => {
    const { tx } = await transaction();
    // Synthetic token, never sent to a provider or used to authorize an account.
    const idToken = `e30.${btoa(JSON.stringify({ preferred_username: preferred, email })).replace(/=+$/, "")}.offline`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "offline-access-fixture",
      refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: MICROSOFT_SCOPES.join(" "), id_token: idToken }))
      .mockResolvedValueOnce(Response.json({ id: "throwaway-microsoft-identity", mail, userPrincipalName: upn }));
    const grant = await verifyMicrosoftCode(config, tx, "offline-code", fetcher);
    expect(grant.profile.email).toBe(expected);
    expect(grant.profile.id).toBe("throwaway-microsoft-identity");
  });
  it.each([undefined, "malformed", "e30.bm90LWpzb24.offline"])("reports no address only when all address sources are empty (token %s)", async (idToken) => {
    const { tx } = await transaction();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "offline-access-fixture",
      refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: MICROSOFT_SCOPES.join(" "),
      ...(idToken ? { id_token: idToken } : {}) }))
      .mockResolvedValueOnce(Response.json({ id: "throwaway-microsoft-identity", mail: null, userPrincipalName: " " }));
    await expect(verifyMicrosoftCode(config, tx, "offline-code", fetcher)).rejects.toThrow("no usable mailbox address");
  });
  it("does not misreport a nonempty invalid address as a missing address", async () => {
    const { tx } = await transaction();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "offline-access-fixture",
      refresh_token: "offline-refresh-fixture", token_type: "Bearer", scope: MICROSOFT_SCOPES.join(" ") }))
      .mockResolvedValueOnce(Response.json({ id: "throwaway-microsoft-identity", mail: "not-an-email" }));
    await expect(verifyMicrosoftCode(config, tx, "offline-code", fetcher)).rejects.toThrow("invalid email format");
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