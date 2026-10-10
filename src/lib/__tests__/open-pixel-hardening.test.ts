import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOpenToken, classifyOpenRequest, parseOpenToken, signOpenPayload } from "@/lib/open-tracking";
import { readPixelToken } from "@/routes/api/public/open";

const target = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  messageKind: "campaign" as const,
  messageId: "22222222-2222-2222-2222-222222222222",
};

afterEach(() => vi.unstubAllEnvs());

describe("pixel token reading", () => {
  const token = buildOpenToken(target);
  it("reads a normal token", () => {
    expect(readPixelToken(new URL(`https://x.test/api/public/open?t=${encodeURIComponent(token)}`))).toBe(token);
  });
  it("tolerates a mangled parameter name and stray characters", () => {
    expect(readPixelToken(new URL(`https://x.test/api/public/open?t+=${token}`))).toBe(token);
    expect(parseOpenToken(readPixelToken(new URL(`https://x.test/o?t=${token}%20`)))).not.toBeNull();
  });
  it("still rejects a forged or missing token", () => {
    expect(parseOpenToken(readPixelToken(new URL(`https://x.test/o?t=${token.slice(0, -2)}xx`)))).toBeNull();
    expect(readPixelToken(new URL("https://x.test/o"))).toBe("");
  });
  it.each(["%20", "%2B", "%00", "%2F", "%25", "%E2%80%8B", "%ZZ"])(
    "does not let malformed characters %s bypass an invalid signature", (characters) => {
      const [payload] = token.split(".");
      const forged = `${payload}.${"0".repeat(32)}${characters}`;
      expect(parseOpenToken(readPixelToken(new URL(`https://x.test/o?t=${forged}`)))).toBeNull();
    },
  );
  it("rejects an extra unsigned token segment", () => {
    expect(parseOpenToken(`${token}.unsigned`)).toBeNull();
  });
  it("rejects an unknown signed message kind rather than assuming campaign", () => {
    const payload = Buffer.from(JSON.stringify({ w: target.workspaceId, m: target.messageId, k: "warmup" })).toString("base64url");
    expect(parseOpenToken(`${payload}.${signOpenPayload(payload)}`)).toBeNull();
  });
  it("fails closed when only a public signing key is available", () => {
    for (const key of ["OPEN_TRACKING_SECRET", "UNSUBSCRIBE_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY"]) vi.stubEnv(key, "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "throwaway-public-key");
    const payload = Buffer.from(JSON.stringify({ w: target.workspaceId, m: target.messageId, k: "c" })).toString("base64url");
    // A public value must not authorize writes, even if an attacker signs with it.
    expect(parseOpenToken(`${payload}.${signOpenPayload(payload)}`)).toBeNull();
  });
});

describe("Google automated scanner", () => {
  it("does not exclude a reader solely on Google IP and an outdated browser agent", () => {
    expect(
      classifyOpenRequest({
        ip: "66.249.89.10",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246",
      }),
    ).toMatchObject({ isPrefetch: false });
  });
  it("keeps Gmail's image proxy (a reader opening) as a real open", () => {
    expect(classifyOpenRequest({ ip: "66.249.84.1", userAgent: "Mozilla/5.0 (via ggpht.com GoogleImageProxy)" }).isPrefetch).toBe(false);
  });
  it.each([null, "Mozilla/5.0 Chrome/130.0", "Mozilla/5.0 Chrome/42.0"])(
    "does not infer machine activity from Google ownership alone (%s)", (userAgent) => {
      expect(classifyOpenRequest({ ip: "66.249.89.10", userAgent }).isPrefetch).toBe(false);
    },
  );
  it("does not infer machine activity from an outdated agent alone", () => {
    expect(classifyOpenRequest({ ip: "84.1.1.1", userAgent: "Mozilla/5.0 Chrome/42.0 Edge/12.246" }).isPrefetch).toBe(false);
  });
});

describe("recording surfaces write failures", () => {
  it("reports write_failed instead of pretending the open was stored", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client.server", () => {
      const row = { id: target.messageId, workspace_id: target.workspaceId, campaign_id: null, lead_id: null, sending_account_id: null, to_email: "a@x.test", opened_at: null, open_count: 0 };
      const from = (table: string) => {
        const b: any = {
          select: () => b, eq: () => b, update: () => b, upsert: async () => ({ error: null }),
          maybeSingle: async () => ({ data: row, error: null }),
          insert: async () => (table === "email_open_events" ? { error: { message: "timeout" } } : { error: null }),
          then: (r: any) => Promise.resolve({ error: null }).then(r),
        };
        return b;
      };
      return { supabaseAdmin: { from } };
    });
    const { recordOpenHit } = await import("@/lib/open-tracking.server");
    const res = await recordOpenHit({ target, ip: "84.1.1.1", userAgent: "Mozilla/5.0" });
    expect(res).toMatchObject({ recorded: false, reason: "write_failed" });
    vi.doUnmock("@/integrations/supabase/client.server");
  });
});
