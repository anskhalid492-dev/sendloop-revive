import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "CLICK_TRACKING_SECRET",
  "OPEN_TRACKING_SECRET",
  "UNSUBSCRIBE_SECRET",
  "MARKETING_UNSUBSCRIBE_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SB_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;
const PRIVATE = "fixture-private-signing-key-0123456789";
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
  vi.doUnmock("@/integrations/supabase/client.server");
});

const target = {
  workspaceId: "ws-a",
  messageKind: "campaign" as const,
  messageId: "msg-1",
  campaignId: "camp-1",
  leadId: "lead-1",
  email: "fixture@example.test",
};
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
const hmac = (key: string, data: string) =>
  createHmac("sha256", key).update(data).digest("hex").slice(0, 32);

describe("click tracking signing", () => {
  it("fails closed with no private key: links unwrapped, tokens rejected", async () => {
    const m = await import("@/lib/click-tracking");
    expect(m.hasClickTrackingSecret()).toBe(false);
    expect(m.clickUrl(target, "https://example.test/a")).toBe("https://example.test/a");
    const payload = b64({ w: "ws-a", k: "c", m: "msg-1", u: "https://example.test/a" });
    expect(m.parseClickToken(`${payload}.${"".padEnd(32, "0")}`)).toBeNull();
  });

  it("rejects tokens signed with the old public-key and hardcoded fallbacks", async () => {
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] = "public-publishable-key-value-xyz";
    const m = await import("@/lib/click-tracking");
    expect(m.hasClickTrackingSecret()).toBe(false);
    const payload = b64({ w: "ws-a", k: "c", m: "msg-1", u: "https://evil.test/" });
    expect(m.parseClickToken(`${payload}.${hmac("public-publishable-key-value-xyz", payload)}`)).toBeNull();
    expect(m.parseClickToken(`${payload}.${hmac("munchreach-click-tracking", payload)}`)).toBeNull();
  });

  it("rejects too-short secrets", async () => {
    process.env["CLICK_TRACKING_SECRET"] = "short";
    const m = await import("@/lib/click-tracking");
    expect(m.hasClickTrackingSecret()).toBe(false);
  });

  it("keeps verifying links previously signed with the same private key (old format)", async () => {
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = PRIVATE;
    const m = await import("@/lib/click-tracking");
    // Exactly how the previous code built a token.
    const payload = b64({ w: "ws-a", k: "c", m: "msg-1", p: "camp-1", l: null, e: null, u: "https://example.test/x" });
    const hit = m.parseClickToken(`${payload}.${hmac(PRIVATE, payload)}`);
    expect(hit).toMatchObject({ workspaceId: "ws-a", messageId: "msg-1", url: "https://example.test/x" });
  });

  it("rejects forged, malformed and unknown-kind tokens", async () => {
    process.env["OPEN_TRACKING_SECRET"] = PRIVATE;
    const m = await import("@/lib/click-tracking");
    const good = m.buildClickToken(target, "https://example.test/a");
    const [payload] = good.split(".");
    const forged = b64({ w: "ws-b", k: "c", m: "msg-1", u: "https://evil.test/" });
    expect(m.parseClickToken(`${forged}.${good.split(".")[1]}`)).toBeNull();
    expect(m.parseClickToken(`${payload}.${hmac("wrong-key-0123456789abc", payload!)}`)).toBeNull();
    expect(m.parseClickToken(`${good}.extra`)).toBeNull();
    expect(m.parseClickToken(` ${good}`)).toBeNull();
    expect(m.parseClickToken(good.toUpperCase())).toBeNull();
    const badKind = b64({ w: "ws-a", k: "x", m: "msg-1", u: "https://example.test/a" });
    expect(m.parseClickToken(`${badKind}.${hmac(PRIVATE, badKind)}`)).toBeNull();
    const badUrl = b64({ w: "ws-a", k: "c", m: "msg-1", u: "javascript:alert(1)" });
    expect(m.parseClickToken(`${badUrl}.${hmac(PRIVATE, badUrl)}`)).toBeNull();
    const arr = Buffer.from("[1]").toString("base64url");
    expect(m.parseClickToken(`${arr}.${hmac(PRIVATE, arr)}`)).toBeNull();
  });
});

function adminMock(opts: { row?: Record<string, unknown> | null; insertError?: unknown; updateError?: unknown }) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const upserts: unknown[] = [];
  const supabaseAdmin = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: opts.row ?? null, error: null }) }),
      }),
      insert: async (v: unknown) => {
        inserts.push({ table, v });
        return { error: opts.insertError ?? null };
      },
      update: (v: unknown) => ({
        eq: async () => {
          updates.push({ table, v });
          return { error: opts.updateError ?? null };
        },
      }),
      upsert: async (v: unknown, o: unknown) => {
        upserts.push({ table, v, o });
        return { error: null };
      },
    }),
  };
  vi.doMock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
  vi.doMock("@/lib/automation-engine.server", () => ({ emitAutomationEvent: async () => {} }));
  return { inserts, updates, upserts };
}

const hit = { ...target, url: "https://example.test/a" };
const ownRow = {
  id: "msg-1", workspace_id: "ws-a", campaign_id: "camp-real", lead_id: "lead-real",
  sending_account_id: null, to_email: "real@example.test", clicked_at: null,
};

describe("click recording", () => {
  it("writes nothing for a message owned by another workspace", async () => {
    const db = adminMock({ row: { ...ownRow, workspace_id: "ws-b" } });
    const { recordClickHit } = await import("@/lib/click-tracking.server");
    expect(await recordClickHit({ hit })).toEqual({ recorded: false, reason: "unknown_message" });
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("writes nothing for an unknown message", async () => {
    const db = adminMock({ row: null });
    const { recordClickHit } = await import("@/lib/click-tracking.server");
    expect((await recordClickHit({ hit })).recorded).toBe(false);
    expect(db.inserts).toHaveLength(0);
  });

  it("attributes from the stored row and dedupes the engagement mirror per message", async () => {
    const db = adminMock({ row: ownRow });
    const { recordClickHit } = await import("@/lib/click-tracking.server");
    expect(await recordClickHit({ hit })).toEqual({ recorded: true });
    const raw = db.inserts[0] as { v: Record<string, unknown> };
    expect(raw.v["campaign_id"]).toBe("camp-real");
    expect(raw.v["lead_id"]).toBe("lead-real");
    const up = db.upserts[0] as { v: Record<string, unknown>; o: Record<string, unknown> };
    expect(up.v["external_id"]).toBe("click:link:msg-1");
    expect(up.o).toEqual({ onConflict: "external_id", ignoreDuplicates: true });
  });

  it("reports a failed raw insert and skips the follow-up writes", async () => {
    const db = adminMock({ row: ownRow, insertError: { message: "denied" } });
    const { recordClickHit } = await import("@/lib/click-tracking.server");
    expect(await recordClickHit({ hit })).toEqual({ recorded: false, reason: "write_failed" });
    expect(db.updates).toHaveLength(0);
    expect(db.upserts).toHaveLength(0);
  });

  it("reports a partial failure when the message update fails", async () => {
    adminMock({ row: ownRow, updateError: { message: "x" } });
    const { recordClickHit } = await import("@/lib/click-tracking.server");
    expect(await recordClickHit({ hit })).toEqual({ recorded: true, reason: "partial_message_update_failed" });
  });
});

describe("click endpoint", () => {
  it("an invalid token is not recorded and never redirects to the token's URL", async () => {
    process.env["OPEN_TRACKING_SECRET"] = PRIVATE;
    const db = adminMock({ row: ownRow });
    const { Route } = await import("@/routes/api/public/click");
    const payload = b64({ w: "ws-a", k: "c", m: "msg-1", u: "https://evil.test/" });
    const handlers = (Route.options as { server: { handlers: { GET: (a: { request: Request }) => Promise<Response> } } }).server.handlers;
    const res = await handlers.GET({
      request: new Request(`https://munchreach.com/api/public/click?t=${payload}.${hmac("munchreach-click-tracking", payload)}`),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).not.toContain("evil.test");
    expect(db.inserts).toHaveLength(0);
  });
});

describe("marketing open signing", () => {
  const mt = { sendEventId: "send-1", subscriberId: null, email: "fixture@example.test", campaignId: null, automationId: null };

  it("fails closed with no private key: no pixel, tokens rejected", async () => {
    const m = await import("@/lib/marketing/engagement-tracking");
    expect(m.marketingOpenPixelUrl(mt)).toBeNull();
    const payload = b64({ m: "send-1", e: "fixture@example.test" });
    expect(m.parseMarketingOpenToken(`${payload}.${hmac("munchreach-marketing-open", `mkt-open:${payload}`)}`)).toBeNull();
  });

  it("verifies old-format pixels signed with the same private key", async () => {
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = PRIVATE;
    const m = await import("@/lib/marketing/engagement-tracking");
    const payload = b64({ m: "send-1", s: null, e: "fixture@example.test", c: null, a: null });
    expect(m.parseMarketingOpenToken(`${payload}.${hmac(PRIVATE, `mkt-open:${payload}`)}`)).toMatchObject({ sendEventId: "send-1" });
    expect(m.marketingOpenPixelUrl(mt)).toContain("/api/public/marketing/open?t=");
  });

  it("rejects forged and malformed tokens", async () => {
    process.env["OPEN_TRACKING_SECRET"] = PRIVATE;
    const m = await import("@/lib/marketing/engagement-tracking");
    const good = m.buildMarketingOpenToken(mt);
    const forged = b64({ m: "send-2", e: "other@example.test" });
    expect(m.parseMarketingOpenToken(`${forged}.${good.split(".")[1]}`)).toBeNull();
    expect(m.parseMarketingOpenToken(`${good}.x`)).toBeNull();
    const noAt = b64({ m: "send-1", e: "nope" });
    expect(m.parseMarketingOpenToken(`${noAt}.${hmac(PRIVATE, `mkt-open:${noAt}`)}`)).toBeNull();
  });
});

function marketingDb(opts: { send?: Record<string, unknown> | null; existing?: boolean; dupError?: boolean; insertError?: boolean }) {
  const inserts: unknown[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    c["eq"] = () => c;
    c["maybeSingle"] = async () => result;
    c["limit"] = async () => (opts.dupError ? { data: null, error: { message: "x" } } : { data: opts.existing ? [{ id: "e" }] : [], error: null });
    return c;
  };
  const supabaseAdmin = {
    from: () => ({
      select: () => chain({ data: opts.send ?? null, error: null }),
      insert: async (v: unknown) => {
        inserts.push(v);
        return { error: opts.insertError ? { message: "x" } : null };
      },
    }),
  };
  vi.doMock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
  return inserts;
}
const send = { id: "send-1", email: "Fixture@Example.test", subscriber_id: null, campaign_id: null, automation_id: null, created_at: "2026-01-01", metadata: {} };
const tgt = { sendEventId: "send-1", subscriberId: null, email: "fixture@example.test", campaignId: null, automationId: null };

describe("marketing open recording", () => {
  it("records one open for the matching send", async () => {
    const inserts = marketingDb({ send });
    const { recordMarketingOpen } = await import("@/lib/marketing/engagement.server");
    await recordMarketingOpen({ target: tgt, isPrefetch: false, source: null });
    expect(inserts).toHaveLength(1);
  });
  it("skips duplicates and mismatched recipients", async () => {
    let inserts = marketingDb({ send, existing: true });
    let mod = await import("@/lib/marketing/engagement.server");
    await mod.recordMarketingOpen({ target: tgt, isPrefetch: false, source: null });
    expect(inserts).toHaveLength(0);
    vi.resetModules();
    inserts = marketingDb({ send });
    mod = await import("@/lib/marketing/engagement.server");
    await mod.recordMarketingOpen({ target: { ...tgt, email: "other@example.test" }, isPrefetch: false, source: null });
    expect(inserts).toHaveLength(0);
  });
  it("surfaces duplicate-check and insert failures instead of hiding them", async () => {
    let inserts = marketingDb({ send, dupError: true });
    let mod = await import("@/lib/marketing/engagement.server");
    await expect(mod.recordMarketingOpen({ target: tgt, isPrefetch: false, source: null })).rejects.toThrow("marketing_duplicate_check_failed");
    expect(inserts).toHaveLength(0);
    vi.resetModules();
    inserts = marketingDb({ send, insertError: true });
    mod = await import("@/lib/marketing/engagement.server");
    await expect(mod.recordMarketingOpen({ target: tgt, isPrefetch: false, source: null })).rejects.toThrow("marketing_open_insert_failed");
  });
});
