import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildClickToken, parseClickToken } from "@/lib/click-tracking";
import { buildOpenToken, parseOpenToken } from "@/lib/open-tracking";

/** Exact token format the previous release minted (fake data only). */
function legacyToken(key: string, body: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = createHmac("sha256", key).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

const ENV = [
  "CLICK_TRACKING_SECRET",
  "OPEN_TRACKING_SECRET",
  "UNSUBSCRIBE_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SB_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];
const saved: Record<string, string | undefined> = {};
const KEY = "fake-service-role-key-for-tests-0123456789";
const W = "11111111-1111-1111-1111-111111111111";
const M = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  for (const n of ENV) {
    saved[n] = process.env[n];
    delete process.env[n];
  }
});
afterEach(() => {
  for (const n of ENV) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});

describe("already-sent tracking tokens", () => {
  it("old click link verifies and keeps its exact destination", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
    const url = "https://example.com/pricing?utm_source=x&a=1#top";
    const hit = parseClickToken(
      legacyToken(KEY, { w: W, k: "c", m: M, p: "camp", l: "lead", e: "a@example.com", u: url }),
    );
    expect(hit?.url).toBe(url);
    expect(hit?.workspaceId).toBe(W);
    expect(hit?.messageId).toBe(M);
  });

  it("old open pixel verifies", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
    const t = parseOpenToken(legacyToken(KEY, { w: W, k: "c", m: M, p: null, l: null, e: null }));
    expect(t?.messageId).toBe(M);
  });

  it("old token signed with an untrimmed key value still verifies", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = `${KEY}\n`;
    expect(parseOpenToken(legacyToken(`${KEY}\n`, { w: W, k: "c", m: M }))).not.toBeNull();
    expect(
      parseClickToken(legacyToken(`${KEY}\n`, { w: W, k: "c", m: M, u: "https://example.com/" })),
    ).not.toBeNull();
  });

  it("old click link with a very long destination still verifies", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
    const url = `https://example.com/?q=${"x".repeat(5000)}`;
    expect(parseClickToken(legacyToken(KEY, { w: W, k: "c", m: M, u: url }))?.url).toBe(url);
  });

  it("new tokens round-trip", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
    const target = { workspaceId: W, messageKind: "campaign" as const, messageId: M };
    expect(parseClickToken(buildClickToken(target, "https://example.com/a"))?.url).toBe(
      "https://example.com/a",
    );
    expect(parseOpenToken(buildOpenToken(target))?.messageId).toBe(M);
  });

  it("tokens signed with the public key or old literal are rejected", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "public-publishable-key-value-xyz";
    const body = { w: W, k: "c", m: M, u: "https://evil.example/" };
    expect(parseClickToken(legacyToken("public-publishable-key-value-xyz", body))).toBeNull();
    expect(parseClickToken(legacyToken("munchreach-click-tracking", body))).toBeNull();
  });

  it("tampered destination is rejected", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
    const good = legacyToken(KEY, { w: W, k: "c", m: M, u: "https://example.com/" });
    const sig = good.split(".")[1];
    const forged = Buffer.from(
      JSON.stringify({ w: W, k: "c", m: M, u: "https://evil.example/" }),
    ).toString("base64url");
    expect(parseClickToken(`${forged}.${sig}`)).toBeNull();
  });

  it("no private key: everything rejected", () => {
    expect(parseOpenToken(legacyToken("munchreach-click-tracking", { w: W, k: "c", m: M }))).toBeNull();
  });
});
