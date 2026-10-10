import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Throwaway fixtures only. The recorder is mocked so no database is touched.
const recorder = vi.hoisted(() => ({ impl: vi.fn() }));
vi.mock("@/lib/open-tracking.server", () => ({ recordOpenHit: recorder.impl }));

import {
  buildOpenToken,
  classifyOpenRequest,
  hasOpenTrackingSecret,
  openPixelUrl,
  parseOpenToken,
  signOpenPayload,
} from "@/lib/open-tracking";
import { Route } from "@/routes/api/public/open";

const PRIVATE_KEYS = ["OPEN_TRACKING_SECRET", "UNSUBSCRIBE_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY"];
const target = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  messageKind: "campaign" as const,
  messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const hmac = (key: string, payload: string) => createHmac("sha256", key).update(payload).digest("hex").slice(0, 32);
const clearPrivateKeys = () => PRIVATE_KEYS.forEach((key) => vi.stubEnv(key, ""));

beforeEach(() => {
  recorder.impl.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signing secret fails closed", () => {
  it("rejects tokens signed with the old hardcoded literal or a public key", () => {
    clearPrivateKeys();
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "throwaway-public-key-value");
    const payload = encode({ w: target.workspaceId, m: target.messageId, k: "c" });
    expect(parseOpenToken(`${payload}.${hmac("munchreach-open-tracking", payload)}`)).toBeNull();
    expect(parseOpenToken(`${payload}.${hmac("throwaway-public-key-value", payload)}`)).toBeNull();
    expect(hasOpenTrackingSecret()).toBe(false);
    expect(signOpenPayload(payload)).toBe("");
  });
  it("does not inject a pixel without a private key, and never logs key material", () => {
    clearPrivateKeys();
    expect(openPixelUrl(target)).toBe("");
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("signing_secret_missing");
  });
  it("ignores trivially short values", () => {
    clearPrivateKeys();
    vi.stubEnv("OPEN_TRACKING_SECRET", "short");
    expect(hasOpenTrackingSecret()).toBe(false);
  });
  it("keeps verifying tokens signed by the previous private-key order", () => {
    clearPrivateKeys();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "throwaway-private-service-key-0123456789");
    const payload = encode({ w: target.workspaceId, m: target.messageId, k: "c" });
    expect(parseOpenToken(`${payload}.${hmac("throwaway-private-service-key-0123456789", payload)}`)).toMatchObject({ messageId: target.messageId });
    expect(openPixelUrl(target)).toMatch(/\/api\/public\/open\?t=/);
  });
});

describe("strict token grammar", () => {
  const sign = (value: unknown) => {
    const payload = encode(value);
    return `${payload}.${signOpenPayload(payload)}`;
  };
  it.each([
    ["extra signed-looking segment", () => `${buildOpenToken(target)}.${"a".repeat(32)}`],
    ["uppercase signature", () => { const [p, s] = buildOpenToken(target).split("."); return `${p}.${s!.toUpperCase()}`; }],
    ["short signature", () => buildOpenToken(target).slice(0, -1)],
    ["missing kind", () => sign({ w: target.workspaceId, m: target.messageId })],
    ["numeric kind", () => sign({ w: target.workspaceId, m: target.messageId, k: 1 })],
    ["array payload", () => sign([target.workspaceId, target.messageId])],
    ["non-id workspace", () => sign({ w: "a b", m: target.messageId, k: "c" })],
    ["oversized payload", () => sign({ w: target.workspaceId, m: target.messageId, k: "c", x: "y".repeat(3000) })],
    ["non-JSON payload", () => { const p = Buffer.from("not json").toString("base64url"); return `${p}.${signOpenPayload(p)}`; }],
  ])("rejects %s", (_name, make) => {
    expect(parseOpenToken(make())).toBeNull();
  });
  it("accepts both kinds this module mints", () => {
    expect(parseOpenToken(buildOpenToken(target))?.messageKind).toBe("campaign");
    expect(parseOpenToken(buildOpenToken({ ...target, messageKind: "conversation" }))?.messageKind).toBe("conversation");
  });
});

describe("scanner classification preserves uncertainty", () => {
  it("labels Google-network requests as unverified without excluding them", () => {
    expect(classifyOpenRequest({ ip: "66.249.93.4", userAgent: "Mozilla/5.0" })).toEqual({ isPrefetch: false, source: "google_network_unverified" });
  });
  it("still excludes Apple privacy prefetches", () => {
    expect(classifyOpenRequest({ userAgent: "AppleMailProxy" }).isPrefetch).toBe(true);
  });
});

describe("endpoint logs", () => {
  const handler = (Route.options as unknown as { server: { handlers: { GET: (args: { request: Request }) => Promise<Response> } } }).server.handlers.GET;
  it("never logs token, recipient or secret when recording throws", async () => {
    const token = buildOpenToken({ ...target, email: "throwaway-endpoint-canary@example.test" });
    const secretValue = process.env["OPEN_TRACKING_SECRET"]!;
    recorder.impl.mockRejectedValue(new Error(`boom ${token} throwaway-endpoint-canary@example.test ${secretValue}`));
    const response = await handler({ request: new Request(`https://example.test/api/public/open?t=${token}`) });
    expect(response.headers.get("content-type")).toBe("image/gif");
    const logged = [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.log).mock.calls].flat()
      .map((item) => (item instanceof Error ? `${item.message} ${item.stack}` : String(item))).join(" ");
    expect(logged).toContain("record_threw");
    for (const sensitive of [token, token.split(".")[0]!, token.split(".")[1]!, "throwaway-endpoint-canary@example.test", secretValue]) {
      expect(logged).not.toContain(sensitive);
    }
  });
  it("does not call the recorder for an invalid token", async () => {
    await handler({ request: new Request(`https://example.test/api/public/open?t=${buildOpenToken(target)}.extra`) });
    expect(recorder.impl).not.toHaveBeenCalled();
  });
});
