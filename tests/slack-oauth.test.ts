import { beforeAll, describe, expect, it } from "vitest";

/**
 * Guards the security-critical parts of the Slack OAuth flow: the signed,
 * expiring state value and the customer-safe error mapping. No network calls,
 * no database, no real Slack app — pure logic only.
 */
beforeAll(() => {
  process.env["PROVIDER_CREDENTIALS_KEY"] = "test-key-for-slack-state-only";
  process.env["SLACK_CLIENT_ID"] = "1234.5678";
  process.env["SLACK_CLIENT_SECRET"] = "test-secret";
});

describe("slack oauth state", () => {
  it("round-trips a signed state", async () => {
    const { signState, verifyState, newStateNonce } = await import("@/lib/slack.server");
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
    const { signState, verifyState } = await import("@/lib/slack.server");
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
    const { signState, verifyState } = await import("@/lib/slack.server");
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

describe("slack authorize url", () => {
  it("requests only the incoming-webhook scope on our callback", async () => {
    const { slackAuthorizeUrl, slackRedirectUri } = await import("@/lib/slack.server");
    const url = new URL(slackAuthorizeUrl("https://munchreach.com", "state123"));
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("scope")).toBe("incoming-webhook");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://munchreach.com/api/public/integrations/slack/callback",
    );
    expect(slackRedirectUri("https://munchreach.com/")).toBe(
      "https://munchreach.com/api/public/integrations/slack/callback",
    );
  });
});

describe("slack customer errors", () => {
  it("never leaks Slack's machine codes", async () => {
    const { slackErrorForCustomer } = await import("@/lib/slack.server");
    const cases = ["invalid_code", "token_revoked", "missing_scope", "ratelimited", "weird_new_code"];
    for (const code of cases) {
      const message = slackErrorForCustomer(code);
      expect(message).not.toContain(code);
      expect(message.length).toBeGreaterThan(10);
    }
  });
});
